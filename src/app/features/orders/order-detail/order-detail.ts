import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth';
import { formatBalanceAmount } from '../../../core/cart/cart';
import {
  HistoryEntry,
  OrderDetail,
  OrderLine,
  OrderService,
  OrderStatus,
  Shipment,
  historySourceLabel,
  historyStatusLabel,
  lineStatusLabel,
  orderStatusLabel,
  orderStatusTone,
  shipmentStatusLabel,
} from '../../../core/order/order';
import { ConfirmService } from '../../../shared/confirm/confirm';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

// Only these statuses mean there's still something to call off — once it's
// sent/shipped/delivered/cancelled/rejected, cancelling is no longer an
// option.
const CANCELLABLE_STATUSES: OrderStatus[] = ['PENDING_APPROVAL', 'SUBMITTED', 'SEND_FAILED'];

@Component({
  selector: 'app-order-detail-page',
  imports: [Header, Footer, RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-detail.html',
  styleUrls: ['../../../shared/shared.css', './order-detail.css'],
})
export class OrderDetailPage implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly authService = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Bound from the route (`/orders/:orderId`, see app.routes.ts).
  readonly orderId = input('');

  // Only meaningful arriving straight from Place order's own navigation —
  // captured once at construction, since `history.state` reflects
  // whichever navigation is current, and later reloads (e.g. after
  // cancelling) shouldn't keep showing the "just placed" banner forever.
  readonly justPlaced = this.isBrowser && !!history.state?.['justPlaced'];

  readonly loading = signal(false);
  readonly order = signal<OrderDetail | null>(null);
  readonly notFound = signal(false);
  readonly error = signal<string | null>(null);

  readonly cancelling = signal(false);
  readonly cancelError = signal<string | null>(null);

  readonly formatAmount = formatBalanceAmount;
  readonly statusLabel = orderStatusLabel;
  readonly statusTone = orderStatusTone;
  readonly lineStatusLabel = lineStatusLabel;
  readonly historySourceLabel = historySourceLabel;
  readonly shipmentStatusLabel = shipmentStatusLabel;

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

  readonly canCancel = computed(() => {
    const order = this.order();
    if (!order) {
      return false;
    }
    const empId = Number(this.authService.session()?.empId);
    const ownsOrder = Number.isFinite(empId) && empId === order.employeeId;
    return ownsOrder && CANCELLABLE_STATUSES.includes(order.status);
  });

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
      },
      error: () => {
        this.loading.set(false);
        this.error.set('We could not load this order.');
      },
    });
  }

  cancelOrder(): void {
    const order = this.order();
    if (!order || this.cancelling()) {
      return;
    }

    this.confirmService
      .ask({
        title: 'Cancel order',
        message: `Cancel order ${order.orderNumber}? Any allotment it used will be returned.`,
        confirmLabel: 'Cancel order',
        danger: true,
      })
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.cancelling.set(true);
        this.cancelError.set(null);

        this.orderService.cancel(order.orderId).subscribe({
          next: (result) => {
            this.cancelling.set(false);
            if (!result.success) {
              this.cancelError.set(result.message);
              return;
            }
            // Re-fetch rather than optimistically patching the status —
            // cancelling can also touch `paidFrom`/the timeline, and the
            // server is the source of truth for all of it.
            this.load();
          },
          error: () => {
            this.cancelling.set(false);
            this.cancelError.set('We could not cancel this order. Please try again.');
          },
        });
      });
  }
}
