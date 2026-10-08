import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { CartService, formatBalanceAmount } from '../../../core/cart/cart';
import {
  OrderDatePreset,
  OrderPage,
  OrderService,
  OrderSort,
  OrderSummary,
  OrderThumb,
  PRODUCT_IMAGE_PLACEHOLDER,
  orderStatusLabel,
  orderStatusTone,
} from '../../../core/order/order';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

const PAGE_SIZE = 25;

// The order-card image strip shows at most this many thumbnails — any
// further distinct products just add to the "+N" count instead, regardless
// of how many thumbnails the API itself sent (up to 4).
const MAX_THUMBS = 3;

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
  imports: [Header, Footer, RouterLink, CurrencyPipe, ReactiveFormsModule],
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

  readonly orderNumberControl = new FormControl('', { nonNullable: true });
  // `''`/`''` means no manual range is in effect — displayed in the date
  // inputs either way, so a preset click can fill them in from the
  // server's own resolved range (see `load`).
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  // `null` until a quick-range chip is clicked, or once a manually-typed
  // date clears it again — the "All time" chip still shows active in that
  // gap (see `activeDatePreset`), it's just not something this needs to
  // explicitly send until the employee asks for it.
  readonly datePreset = signal<OrderDatePreset | null>(null);
  readonly sort = signal<OrderSort>('NEWEST');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly orderPage = signal<OrderPage | null>(null);

  readonly orders = computed(() => this.orderPage()?.data ?? []);
  readonly pagination = computed(() => this.orderPage()?.pagination ?? null);
  readonly statusCounts = computed(() => this.orderPage()?.statusCounts ?? null);

  // Which quick-range chip reads as "active" — a locally chosen preset
  // takes priority; otherwise it's "All time" unless a custom range is
  // actually in the date inputs, in which case none of the three apply.
  readonly activeDatePreset = computed<OrderDatePreset | null>(() => {
    const preset = this.datePreset();
    if (preset) {
      return preset;
    }
    return this.dateFrom() || this.dateTo() ? null : 'ALL';
  });

  readonly statusLabel = orderStatusLabel;
  readonly statusTone = orderStatusTone;
  readonly placeholderImage = PRODUCT_IMAGE_PLACEHOLDER;

  // Debounced so the list doesn't re-fetch on every keystroke — only once
  // typing pauses for a moment.
  private readonly debouncedOrderNumberSearch = this.orderNumberControl.valueChanges
    .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
    .subscribe(() => {
      this.page.set(1);
      this.load();
    });

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

  // `null` until a response has come back at all — the chips render
  // without a count badge rather than a misleading 0 while still loading.
  // A string (not the raw number) so a real `0` count still renders its
  // badge in the template's `@if (...; as count)` without special-casing.
  chipCount(value: string): string | null {
    const counts = this.statusCounts();
    if (!counts) {
      return null;
    }
    return String(counts[(value || 'ALL') as keyof typeof counts]);
  }

  setDatePreset(preset: OrderDatePreset): void {
    this.datePreset.set(preset);
    this.dateFrom.set('');
    this.dateTo.set('');
    this.page.set(1);
    this.load();
  }

  onDateFromChange(value: string): void {
    this.dateFrom.set(value);
    this.datePreset.set(null);
    this.page.set(1);
    this.load();
  }

  onDateToChange(value: string): void {
    this.dateTo.set(value);
    this.datePreset.set(null);
    this.page.set(1);
    this.load();
  }

  setSort(sort: OrderSort): void {
    if (sort === this.sort()) {
      return;
    }
    this.sort.set(sort);
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

  // `null` means nothing worth showing on this row.
  paidByAllotmentLabel(order: OrderSummary): string | null {
    if (this.pointsOnly()) {
      if (order.allotPointsUsed <= 0 && order.allotUnitsUsed <= 0) {
        return null;
      }
      const parts: string[] = [];
      if (order.allotPointsUsed > 0) {
        parts.push(`${order.allotPointsUsed} pts`);
      }
      if (order.allotUnitsUsed > 0) {
        parts.push(order.allotUnitsUsed === 1 ? '1 unit' : `${order.allotUnitsUsed} units`);
      }
      return `Paid by allotment: ${parts.join(' + ')}`;
    }
    const dollars = formatBalanceAmount(order.allotDollarsUsed, 'DOLLARS');
    if (order.allotUnitsUsed <= 0) {
      return `Paid by allotment: ${dollars}`;
    }
    const units = order.allotUnitsUsed === 1 ? '1 unit' : `${order.allotUnitsUsed} units`;
    return `Paid by allotment: ${dollars} (+ ${units})`;
  }

  displayedThumbs(order: OrderSummary): OrderThumb[] {
    return order.thumbnails.slice(0, MAX_THUMBS);
  }

  // How many distinct products beyond the (at most 3) shown thumbnails —
  // for the "+N" badge.
  moreThumbsCount(order: OrderSummary): number {
    return Math.max(0, order.lineCount - this.displayedThumbs(order).length);
  }

  // Timestamps are `'YYYY-MM-DD HH:MM:SS'` with no timezone — this row only
  // needs the date half, the detail page's own timeline shows the rest.
  orderDate(ts: string): string {
    return ts.split(' ')[0] ?? ts;
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    const preset = this.datePreset();

    this.orderService
      .list({
        status: this.statusFilter(),
        orderNumber: this.orderNumberControl.value.trim(),
        ...(preset ? { datePreset: preset } : { dateFrom: this.dateFrom(), dateTo: this.dateTo() }),
        sort: this.sort(),
        page: this.page(),
        pageSize: PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          this.loading.set(false);
          if ('success' in result) {
            this.error.set(result.message);
            return;
          }
          this.orderPage.set(result);
          // A preset resolves to a concrete range server-side — reflect it
          // in the date inputs so they don't just sit blank under an
          // active "Last 30 days" chip.
          if (preset) {
            this.dateFrom.set(result.filters.dateFrom);
            this.dateTo.set(result.filters.dateTo);
          }
        },
        error: () => {
          this.loading.set(false);
          this.error.set('We could not load your orders.');
        },
      });
  }
}
