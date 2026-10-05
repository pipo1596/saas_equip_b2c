import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CartService, formatBalanceAmount } from '../../../core/cart/cart';
import {
  OrderPage,
  OrderService,
  OrderSummary,
  PRODUCT_IMAGE_PLACEHOLDER,
  orderStatusLabel,
  orderStatusTone,
} from '../../../core/order/order';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

const PAGE_SIZE = 25;

const STATUS_CHIPS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Processing', value: 'PROCESSING' },
  { label: 'Partially shipped', value: 'PARTIALLY_SHIPPED' },
  { label: 'Shipped', value: 'SHIPPED' },
  { label: 'Pending approval', value: 'PENDING_APPROVAL' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Cancelled', value: 'CANCELLED' },
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
  private readonly cartService = inject(CartService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Based on the employee's *current* allotment — applied retroactively to
  // past orders too, so a points-only employee never sees a dollar figure
  // anywhere, including their own order history.
  readonly pointsOnly = this.cartService.pointsOnly;

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
  readonly placeholderImage = PRODUCT_IMAGE_PLACEHOLDER;

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

  // `null` means nothing worth showing on this row — for a points-only
  // employee there's no points-used aggregate on this list endpoint (only
  // `allotDollarsUsed`/`allotUnitsUsed`), so a dollar figure (which would
  // misleadingly show "$0.00") is omitted rather than shown.
  paidByAllotmentLabel(order: OrderSummary): string | null {
    if (this.pointsOnly()) {
      if (order.allotUnitsUsed <= 0) {
        return null;
      }
      const units = order.allotUnitsUsed === 1 ? '1 unit' : `${order.allotUnitsUsed} units`;
      return `Paid by allotment: ${units}`;
    }
    const dollars = formatBalanceAmount(order.allotDollarsUsed, 'DOLLARS');
    if (order.allotUnitsUsed <= 0) {
      return `Paid by allotment: ${dollars}`;
    }
    const units = order.allotUnitsUsed === 1 ? '1 unit' : `${order.allotUnitsUsed} units`;
    return `Paid by allotment: ${dollars} (+ ${units})`;
  }

  // `thumbnails` only ever holds up to 4 — this is how many more distinct
  // products beyond those the order has, for the "+N more" badge.
  moreThumbsCount(order: OrderSummary): number {
    return Math.max(0, order.lineCount - order.thumbnails.length);
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
