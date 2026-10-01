import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatBalanceAmount } from '../../../core/cart/cart';
import { OrderPage, OrderService, OrderSummary, orderStatusLabel, orderStatusTone } from '../../../core/order/order';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

const PAGE_SIZE = 25;

// The filter is a single exact status, not a grouped one — "Processing"
// only ever matches `SUBMITTED`, even though `SEND_FAILED` displays with
// the same label (see ORDERS_UI_SPEC.md §5's own note on this).
const STATUS_CHIPS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Pending approval', value: 'PENDING_APPROVAL' },
  { label: 'Processing', value: 'SUBMITTED' },
  { label: 'Shipped', value: 'SHIPPED' },
  { label: 'Partially shipped', value: 'PARTIALLY_SHIPPED' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'Rejected', value: 'REJECTED' },
];

@Component({
  selector: 'app-order-history-page',
  imports: [Header, Footer, RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-history.html',
  styleUrls: ['../../../shared/shared.css', './order-history.css'],
})
export class OrderHistoryPage implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly statusChips = STATUS_CHIPS;
  readonly statusFilter = signal('');
  readonly page = signal(1);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly orderPage = signal<OrderPage | null>(null);

  readonly orders = computed(() => this.orderPage()?.data ?? []);
  readonly pagination = computed(() => this.orderPage()?.pagination ?? null);

  readonly statusLabel = orderStatusLabel;
  readonly statusTone = orderStatusTone;

  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }
    this.load();
  }

  setFilter(status: string): void {
    if (status === this.statusFilter()) {
      return;
    }
    this.statusFilter.set(status);
    this.page.set(1);
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

  paidByAllotmentLabel(order: OrderSummary): string {
    const dollars = formatBalanceAmount(order.allotDollarsUsed, 'DOLLARS');
    if (order.allotUnitsUsed <= 0) {
      return `Paid by allotment: ${dollars}`;
    }
    const units = order.allotUnitsUsed === 1 ? '1 unit' : `${order.allotUnitsUsed} units`;
    return `Paid by allotment: ${dollars} (+ ${units})`;
  }

  // Timestamps are `'YYYY-MM-DD HH:MM:SS'` with no timezone — this row only
  // needs the date half, the detail page's own timeline shows the rest.
  orderDate(ts: string): string {
    return ts.split(' ')[0] ?? ts;
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.orderService
      .list({ status: this.statusFilter(), page: this.page(), pageSize: PAGE_SIZE })
      .subscribe({
        next: (result) => {
          this.loading.set(false);
          if ('success' in result) {
            this.error.set(result.message);
            return;
          }
          this.orderPage.set(result);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('We could not load your orders.');
        },
      });
  }
}
