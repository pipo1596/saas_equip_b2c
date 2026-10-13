import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  ApprovalQueueResponse,
  ApprovalQueueRow,
  ApprovalQueueThumb,
  OrderService,
  PRODUCT_IMAGE_PLACEHOLDER,
  approvalStepLabel,
  isApprovalDueSoon,
} from '../../../core/order/order';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

const PAGE_SIZE = 25;

// The row's own image strip shows at most this many thumbnails — any
// further distinct products just add to the `moreCount` badge instead.
const MAX_THUMBS = 3;

@Component({
  selector: 'app-approval-queue-page',
  imports: [Header, Footer, RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './approval-queue.html',
  styleUrls: ['../../../shared/shared.css', './approval-queue.css'],
})
export class ApprovalQueue implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly page = signal(1);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly queue = signal<ApprovalQueueResponse | null>(null);

  readonly placeholderImage = PRODUCT_IMAGE_PLACEHOLDER;
  readonly approvalStepLabel = approvalStepLabel;

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.load();
  }

  goToPage(page: number): void {
    const totalPages = this.queue()?.pagination.totalPages ?? 1;
    if (page < 1 || page > totalPages || page === this.page()) {
      return;
    }
    this.page.set(page);
    this.load();
  }

  displayedThumbs(row: ApprovalQueueRow): ApprovalQueueThumb[] {
    return row.thumbnails.slice(0, MAX_THUMBS);
  }

  placedByName(row: ApprovalQueueRow): string {
    const { firstName, lastName } = row.placedBy;
    const name = [firstName, lastName].filter(Boolean).join(' ');
    return name || 'Unknown employee';
  }

  // Timestamps are `'YYYY-MM-DD HH:MM:SS'` — these rows only need the date.
  dateOnly(ts: string): string {
    return ts.split(' ')[0] ?? ts;
  }

  // Blank for an OVERRIDE step, per the guide — there's no per-level
  // deadline once it's moved past the normal level chain.
  respondByDate(row: ApprovalQueueRow): string | null {
    if (row.approvalStep.kind === 'OVERRIDE' || !row.approvalStep.dueTs) {
      return null;
    }
    return this.dateOnly(row.approvalStep.dueTs);
  }

  // Highlight a row due today or tomorrow — never for an OVERRIDE step,
  // which has no "Respond by" date shown at all (see `respondByDate`).
  rowDueSoon(row: ApprovalQueueRow): boolean {
    return row.approvalStep.kind !== 'OVERRIDE' && isApprovalDueSoon(row.approvalStep.dueTs);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.orderService.listApprovals(this.page(), PAGE_SIZE).subscribe({
      next: (result) => {
        this.loading.set(false);
        if ('success' in result) {
          this.error.set(result.message);
          return;
        }
        this.queue.set(result);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('We could not load your approvals.');
      },
    });
  }
}
