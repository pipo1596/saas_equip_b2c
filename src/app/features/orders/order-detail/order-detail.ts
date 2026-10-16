import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth';
import { CartService, formatBalanceAmount } from '../../../core/cart/cart';
import { LocationSelectionService } from '../../../core/location/location-selection';
import {
  ApprovalStep,
  HistoryEntry,
  OrderDetail,
  OrderLine,
  OrderService,
  PRODUCT_IMAGE_PLACEHOLDER,
  Shipment,
  approvalStepLabel,
  approvalStepStatusLabel,
  historyByLabel,
  historyStatusLabel,
  lineStatusLabel,
  orderStatusLabel,
  orderStatusTone,
  shipmentStatusLabel,
} from '../../../core/order/order';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

@Component({
  selector: 'app-order-detail-page',
  imports: [Header, Footer, RouterLink, CurrencyPipe, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-detail.html',
  styleUrls: ['../../../shared/shared.css', './order-detail.css'],
})
export class OrderDetailPage implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly cartService = inject(CartService);
  private readonly authService = inject(AuthService);
  private readonly locationSelectionService = inject(LocationSelectionService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  @ViewChild('actionDialogEl') private readonly actionDialogEl?: ElementRef<HTMLDialogElement>;

  // Based on the employee's *current* allotment — applied retroactively to
  // past orders too, so a points-only employee never sees a dollar figure,
  // including on an order they placed before switching programs.
  readonly pointsOnly = this.cartService.pointsOnly;

  // Approve/Reject are blocked server-side (`IMP`) while shopping as an
  // employee — hidden here too rather than waiting for that error.
  readonly impersonating = computed(() => this.authService.impersonation() !== null);

  // Bound from the route (`/orders/:orderId`, see app.routes.ts).
  readonly orderId = input('');

  // Bound from `?action=approve`/`?action=reject` — the approval email's own
  // links (`withComponentInputBinding()` in app.config.ts binds query params
  // to a same-named input the same way it binds path params).
  readonly action = input<string | null>(null);
  // Only auto-open the dialog once, right after the very first load — the
  // page reloads itself after submitting an action (to pick up the new
  // `viewerCanAct`/status), and that reload shouldn't reopen the dialog from
  // the same stale query param.
  private autoOpened = false;

  // Only meaningful arriving straight from Place order's own navigation —
  // captured once at construction, since `history.state` reflects
  // whichever navigation is current, and a later reload of this same page
  // (e.g. via the back button) shouldn't keep showing this banner forever.
  readonly justPlaced = this.isBrowser && !!history.state?.['justPlaced'];

  readonly loading = signal(false);
  readonly order = signal<OrderDetail | null>(null);
  readonly notFound = signal(false);
  readonly error = signal<string | null>(null);

  // Which action dialog (if any) is open — `null` means closed.
  readonly actionDialog = signal<'approve' | 'reject' | null>(null);
  readonly actionNotes = new FormControl('', { nonNullable: true });
  readonly actionPending = signal(false);
  // Set after an approve/reject response, success or failure — shown as a
  // banner above the status banner until the next navigation or action.
  readonly actionMessage = signal<{ tone: 'success' | 'danger'; text: string } | null>(null);

  // Opens/closes the native <dialog> to track `actionDialog` — same
  // afterRenderEffect idiom as `shared/confirm/confirm-dialog.ts`, since a
  // plain effect() only guarantees running after change detection, not
  // after the <dialog> itself exists/updated in the DOM. jsdom (tests)
  // doesn't implement showModal()/close() at all; the dialog just never
  // actually opens there, and the flow is exercised directly via the
  // buttons/signals instead.
  //
  // `actionDialog()` is read *before* the `dialog` null-check, not after —
  // unlike `confirm-dialog.ts`'s own `<dialog>` (always in the DOM from
  // app root), this one only exists once `order()` has loaded, so the very
  // first run of this effect hits the null-check and returns early. A
  // signal effect only re-runs when a signal it actually read changes; if
  // that first (aborted) run never reads `actionDialog()`, it's never
  // registered as a dependency, and the effect would never fire again no
  // matter how many times `actionDialog` changes afterward — reading it
  // unconditionally first keeps it tracked on every run, early return or not.
  private readonly syncActionDialogOpenState = afterRenderEffect(() => {
    const isOpen = this.actionDialog() !== null;
    const dialog = this.actionDialogEl?.nativeElement;
    if (!dialog || typeof dialog.showModal !== 'function') {
      return;
    }
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  });

  readonly formatAmount = formatBalanceAmount;
  readonly placeholderImage = PRODUCT_IMAGE_PLACEHOLDER;
  readonly statusLabel = orderStatusLabel;
  readonly statusTone = orderStatusTone;
  readonly lineStatusLabel = lineStatusLabel;
  readonly historyByLabel = historyByLabel;
  readonly shipmentStatusLabel = shipmentStatusLabel;
  readonly approvalStepLabel = approvalStepLabel;
  readonly approvalStepStatusLabel = approvalStepStatusLabel;

  readonly orderLinesById = computed(() => {
    const map = new Map<number, OrderLine>();
    for (const line of this.order()?.lines ?? []) {
      map.set(line.orderLineId, line);
    }
    return map;
  });

  // Oldest -> newest, regardless of what order the API happens to send
  // them in — timestamps are `'YYYY-MM-DD HH:MM:SS'`, so a plain string
  // sort is already a chronological one.
  readonly sortedHistory = computed(() =>
    [...(this.order()?.history ?? [])].sort((a, b) => a.ts.localeCompare(b.ts)),
  );

  // "2 shipped · 1 backordered" / "1 cancelled" — omitted entirely for a
  // line that's still fully open.
  lineStatusNote(line: OrderLine): string | null {
    const parts: string[] = [];
    if (line.qtyShipped > 0) {
      parts.push(`${line.qtyShipped} shipped`);
    }
    if (line.qtyBackordered > 0) {
      parts.push(`${line.qtyBackordered} backordered`);
    }
    if (line.qtyCancelled > 0) {
      parts.push(`${line.qtyCancelled} cancelled`);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  shipmentLineLabel(shipmentLine: Shipment['lines'][number]): string {
    const line = this.orderLinesById().get(shipmentLine.orderLineId);
    const title = line?.productTitle ?? `Line ${shipmentLine.lineNo}`;
    return `${title} × ${shipmentLine.qty}`;
  }

  // e.g. "SKU ABC-100: Short shipped" for a line-level entry, or just
  // "Awaiting approval -> Processing" for an order-level one.
  historyEntryLabel(entry: HistoryEntry): string {
    const transition = entry.fromStatus
      ? `${historyStatusLabel(entry.fromStatus)} → ${historyStatusLabel(entry.toStatus)}`
      : historyStatusLabel(entry.toStatus);
    if (entry.orderLineId === null) {
      return transition;
    }
    const line = this.orderLinesById().get(entry.orderLineId);
    return `${line?.skuCode ?? `Line ${entry.orderLineId}`}: ${transition}`;
  }

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.load();
  }

  private load(): void {
    const id = Number(this.orderId());
    if (!this.orderId() || !Number.isFinite(id)) {
      this.notFound.set(true);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.notFound.set(false);

    this.orderService.get(id).subscribe({
      next: (result) => {
        this.loading.set(false);
        if ('success' in result) {
          if (result.code === 'NFD') {
            this.notFound.set(true);
          } else {
            this.error.set(result.message);
          }
          return;
        }
        this.order.set(result);
        if (!this.autoOpened) {
          this.autoOpened = true;
          const canAct = result.viewerCanAct === 'Y' && !this.impersonating();
          if (canAct && this.action() === 'approve') {
            this.openApprove();
          } else if (canAct && this.action() === 'reject') {
            this.openReject();
          }
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('We could not load this order.');
      },
    });
  }

  openApprove(): void {
    this.actionNotes.setValue('');
    this.actionDialog.set('approve');
  }

  openReject(): void {
    this.actionNotes.setValue('');
    this.actionDialog.set('reject');
  }

  closeActionDialog(): void {
    this.actionDialog.set(null);
  }

  // Fires for a close the browser triggered itself (Escape, most notably)
  // — a button click already clears `actionDialog` before this can fire,
  // making it a no-op then. Same idiom as `confirm-dialog.ts`'s own
  // `onNativeClose`.
  onActionDialogNativeClose(): void {
    if (this.actionDialog()) {
      this.closeActionDialog();
    }
  }

  // Same "click lands on the dialog itself only via the backdrop" trick as
  // `confirm-dialog.ts`.
  onActionDialogBackdropClick(event: MouseEvent): void {
    if (event.target === this.actionDialogEl?.nativeElement) {
      this.closeActionDialog();
    }
  }

  // Reject requires a non-blank reason; Approve's note is always optional.
  canSubmitAction(): boolean {
    if (this.actionDialog() === 'reject') {
      return this.actionNotes.value.trim().length > 0;
    }
    return true;
  }

  submitAction(): void {
    const kind = this.actionDialog();
    const order = this.order();
    if (!kind || !order || !this.canSubmitAction()) {
      return;
    }

    const notes = this.actionNotes.value.trim();
    this.actionPending.set(true);
    const request =
      kind === 'approve'
        ? this.orderService.approve(order.orderId, notes || undefined)
        : this.orderService.reject(order.orderId, notes);

    request.subscribe({
      next: (result) => {
        this.actionPending.set(false);
        this.actionDialog.set(null);
        if (!result.success) {
          this.actionMessage.set({ tone: 'danger', text: result.message });
        } else if (result.status === 'PROCESSING') {
          this.actionMessage.set({ tone: 'success', text: 'Order approved.' });
        } else if (result.status === 'REJECTED') {
          this.actionMessage.set({ tone: 'success', text: 'Order rejected.' });
        } else {
          this.actionMessage.set({ tone: 'success', text: result.message });
        }
        this.load();
        this.refreshApprovalBadge();
      },
      error: () => {
        this.actionPending.set(false);
        this.actionDialog.set(null);
        this.actionMessage.set({ tone: 'danger', text: 'We could not reach the server. Please try again.' });
      },
    });
  }

  // The header's Approvals badge comes from the cart's own allotment, which
  // this action never touches directly — re-fetch it so the count drops
  // immediately instead of waiting for some unrelated cart refresh.
  private refreshApprovalBadge(): void {
    const locationId = this.locationSelectionService.activeLocation()?.locationId ?? null;
    this.cartService.load(locationId).subscribe({ error: () => {} });
  }
}
