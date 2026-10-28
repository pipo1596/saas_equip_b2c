import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import {
  OrderPage,
  OrderService,
  OrderSummary,
  orderStatusLabel,
  orderStatusTone,
} from '../../../core/order/order';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

const PAGE_SIZE = 25;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING_APPROVAL', label: orderStatusLabel('PENDING_APPROVAL') },
  { value: 'PROCESSING', label: orderStatusLabel('PROCESSING') },
  { value: 'PARTIALLY_SHIPPED', label: orderStatusLabel('PARTIALLY_SHIPPED') },
  { value: 'SHIPPED', label: orderStatusLabel('SHIPPED') },
  { value: 'CANCELLED', label: orderStatusLabel('CANCELLED') },
  { value: 'REJECTED', label: orderStatusLabel('REJECTED') },
];

@Component({
  selector: 'app-admin-orders',
  imports: [Header, Footer, RouterLink, ReactiveFormsModule, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders.html',
  styleUrls: ['../../../shared/shared.css', './orders.css'],
})
export class AdminOrders implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly statusOptions = STATUS_OPTIONS;

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly status = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly page = signal(1);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly orderPage = signal<OrderPage | null>(null);

  readonly orders = computed(() => this.orderPage()?.data ?? []);
  readonly pagination = computed(() => this.orderPage()?.pagination ?? null);

  readonly statusLabel = orderStatusLabel;
  readonly statusTone = orderStatusTone;

  // Guards against a slow earlier search/filter change overwriting the
  // result of a newer one that resolves first — same idiom as
  // `AdminEmployees`.
  private requestId = 0;

  // Debounced so the list doesn't re-fetch on every keystroke — only once
  // typing pauses for a moment.
  private readonly debouncedSearch = this.searchControl.valueChanges
    .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
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

  onStatusChange(value: string): void {
    this.status.set(value);
    this.page.set(1);
    this.load();
  }

  onDateFromChange(value: string): void {
    this.dateFrom.set(value);
    this.page.set(1);
    this.load();
  }

  onDateToChange(value: string): void {
    this.dateTo.set(value);
    this.page.set(1);
    this.load();
  }

  // Not a `computed()` — same reasoning as `AdminEmployees.hasFilters()`: it
  // mixes reactive signals with the search box's own non-signal
  // `FormControl.value`, which wouldn't reliably invalidate a cached result.
  // A plain method re-reads everything fresh on every change-detection pass.
  hasFilters(): boolean {
    return !!this.searchControl.value || !!this.status() || !!this.dateFrom() || !!this.dateTo();
  }

  clearFilters(): void {
    // `emitEvent: false` so this doesn't *also* queue a debounced reload on
    // top of the immediate one below.
    this.searchControl.setValue('', { emitEvent: false });
    this.status.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
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

  // `null` when the row has no `placedBy` attribution to show. `*CUSTLIST`
  // shares its response contract with the employee-facing `*LIST`, which
  // never sends this field — rendered defensively in case a future backend
  // revision adds it for this cross-employee view the way it already does
  // for `*APPRQ`.
  placedByLabel(order: OrderSummary): string | null {
    const placedBy = order.placedBy;
    return placedBy ? `${placedBy.firstName} ${placedBy.lastName}` : null;
  }

  // Timestamps are `'YYYY-MM-DD HH:MM:SS'` with no timezone — only the date
  // half is worth showing in a compact table row.
  orderDate(ts: string): string {
    return ts.split(' ')[0] ?? ts;
  }

  private load(): void {
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.error.set(null);

    this.orderService
      .listForCustomer({
        status: this.status(),
        orderNumber: this.searchControl.value.trim(),
        dateFrom: this.dateFrom(),
        dateTo: this.dateTo(),
        page: this.page(),
        pageSize: PAGE_SIZE,
      })
      .subscribe((result) => {
        if (requestId !== this.requestId) {
          return;
        }
        this.loading.set(false);
        if ('success' in result) {
          this.error.set(result.message);
          return;
        }
        this.orderPage.set(result);
      });
  }
}
