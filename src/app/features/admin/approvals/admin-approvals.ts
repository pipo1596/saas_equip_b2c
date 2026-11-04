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
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import {
  AdmApprovalRow,
  AdmApprovalsResponse,
  AdmApprovalThumb,
  ApprovalStepSummary,
  OrderService,
  PRODUCT_IMAGE_PLACEHOLDER,
} from '../../../core/order/order';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

const PAGE_SIZE = 25;

// The row's own image strip shows at most this many thumbnails — any
// further distinct products just add to the `moreCount` badge instead.
const MAX_THUMBS = 3;

@Component({
  selector: 'app-admin-approvals',
  imports: [Header, Footer, RouterLink, ReactiveFormsModule, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-approvals.html',
  styleUrls: ['../../../shared/shared.css', './admin-approvals.css'],
})
export class AdminApprovals implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  @ViewChild('actionDialogEl') private readonly actionDialogEl?: ElementRef<HTMLDialogElement>;

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly page = signal(1);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly queueResponse = signal<AdmApprovalsResponse | null>(null);

  readonly rows = computed(() => this.queueResponse()?.data ?? []);
  readonly pagination = computed(() => this.queueResponse()?.pagination ?? null);

  // Which row's Approve/Reject dialog (if any) is open, and which action it
  // was opened for.
  readonly actionRow = signal<AdmApprovalRow | null>(null);
  readonly actionKind = signal<'approve' | 'reject' | null>(null);
  readonly actionNotes = new FormControl('', { nonNullable: true });
  readonly actionPending = signal(false);
  // Set after an approve/reject response, success or failure — shown above
  // the table until the next action or reload.
  readonly bannerMessage = signal<{ tone: 'success' | 'danger'; text: string } | null>(null);

  readonly placeholderImage = PRODUCT_IMAGE_PLACEHOLDER;

  // Guards against a slow earlier search/page change overwriting the result
  // of a newer one that resolves first — same idiom as `AdminOrders`.
  private requestId = 0;

  // Debounced so the list doesn't re-fetch on every keystroke — only once
  // typing pauses for a moment.
  private readonly debouncedSearch = this.searchControl.valueChanges
    .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
    .subscribe(() => {
      this.page.set(1);
      this.load();
    });

  // Opens/closes the native <dialog> to track `actionRow` — same
  // afterRenderEffect idiom as `order-detail.ts`'s own action dialog, since
  // jsdom (tests) doesn't implement showModal()/close() at all; the flow is
  // exercised directly via the buttons/signals there instead.
  private readonly syncActionDialogOpenState = afterRenderEffect(() => {
    const isOpen = this.actionRow() !== null;
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

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.load();
  }

  goToPage(page: number): void {
    const totalPages = this.pagination()?.totalPages ?? 1;
    if (page < 1 || page > totalPages || page === this.page()) {
      return;
    }
    this.page.set(page);
    this.load();
  }

  displayedThumbs(row: AdmApprovalRow): AdmApprovalThumb[] {
    return row.thumbnails.slice(0, MAX_THUMBS);
  }

  placedByName(row: AdmApprovalRow): string {
    const { firstName, lastName } = row.placedBy;
    const name = [firstName, lastName].filter(Boolean).join(' ');
    return name || 'Unknown employee';
  }

  // Timestamps are `'YYYY-MM-DD HH:MM:SS'` — these rows only need the date.
  dateOnly(ts: string): string {
    return ts.split(' ')[0] ?? ts;
  }

  // "Waiting on Captain (level 2)" for a level step, "Waiting on an
  // administrator" for an OVERRIDE step or an order placed before
  // multi-level approval existed (`kind: null`, per the API guide).
  waitingOnLabel(step: ApprovalStepSummary): string {
    if (step.kind !== 'LEVEL') {
      return 'Waiting on an administrator';
    }
    return `Waiting on ${step.roleNames ?? 'an approver'} (level ${step.levelNo ?? '?'})`;
  }

  decideByDate(row: AdmApprovalRow): string | null {
    return row.approvalStep.dueTs ? this.dateOnly(row.approvalStep.dueTs) : null;
  }

  openApprove(row: AdmApprovalRow): void {
    this.actionNotes.setValue('');
    this.actionRow.set(row);
    this.actionKind.set('approve');
  }

  openReject(row: AdmApprovalRow): void {
    this.actionNotes.setValue('');
    this.actionRow.set(row);
    this.actionKind.set('reject');
  }

  closeActionDialog(): void {
    this.actionRow.set(null);
    this.actionKind.set(null);
  }

  // Fires for a close the browser triggered itself (Escape, most notably) —
  // a button click already clears `actionRow` before this can fire, making
  // it a no-op then. Same idiom as `order-detail.ts`'s own
  // `onActionDialogNativeClose`.
  onActionDialogNativeClose(): void {
    if (this.actionRow()) {
      this.closeActionDialog();
    }
  }

  onActionDialogBackdropClick(event: MouseEvent): void {
    if (event.target === this.actionDialogEl?.nativeElement) {
      this.closeActionDialog();
    }
  }

  // A note is required on both an administrator approval and rejection,
  // unlike the level-approver dialog where only rejection needs one.
  canSubmitAction(): boolean {
    return this.actionNotes.value.trim().length > 0;
  }

  submitAction(): void {
    const row = this.actionRow();
    const kind = this.actionKind();
    if (!row || !kind || !this.canSubmitAction()) {
      return;
    }

    const notes = this.actionNotes.value.trim();
    this.actionPending.set(true);
    const request =
      kind === 'approve' ? this.orderService.adminApprove(row.orderId, notes) : this.orderService.adminReject(row.orderId, notes);

    request.subscribe({
      next: (result) => {
        this.actionPending.set(false);
        this.closeActionDialog();
        if (!result.success) {
          // Someone else may have already acted on it — reload rather than
          // just dropping it locally, per the API guide.
          this.bannerMessage.set({ tone: 'danger', text: result.message });
          this.load();
          return;
        }
        this.bannerMessage.set({ tone: 'success', text: result.message });
        this.dropRow(row.orderId);
      },
      error: () => {
        this.actionPending.set(false);
        this.closeActionDialog();
        this.bannerMessage.set({ tone: 'danger', text: 'We could not reach the server. Please try again.' });
        this.load();
      },
    });
  }

  private load(): void {
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);

    this.orderService
      .listAdminApprovals({ search: this.searchControl.value.trim(), page: this.page(), pageSize: PAGE_SIZE })
      .subscribe((result) => {
        if (requestId !== this.requestId) {
          return;
        }
        this.loading.set(false);
        if ('success' in result) {
          this.error.set(result.message);
          return;
        }
        this.queueResponse.set(result);
      });
  }

  // Removes an acted-on row without a full reload — simplest to just drop
  // it from the current page rather than re-deriving pagination exactly;
  // the next explicit page/search change re-fetches for real anyway.
  private dropRow(orderId: number): void {
    const current = this.queueResponse();
    if (!current) {
      return;
    }
    this.queueResponse.set({
      ...current,
      data: current.data.filter((row) => row.orderId !== orderId),
      pagination: { ...current.pagination, totalRows: Math.max(0, current.pagination.totalRows - 1) },
    });
  }
}
