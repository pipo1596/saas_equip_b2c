import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatBalanceAmount } from '../../../core/cart/allotment';
import {
  HistoryEntry,
  OrderDetail,
  OrderLine,
  OrderService,
  PRODUCT_IMAGE_PLACEHOLDER,
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
  selector: 'app-admin-order-detail',
  imports: [Header, Footer, RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-detail.html',
  styleUrls: ['../../../shared/shared.css', './order-detail.css'],
})
export class AdminOrderDetail implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Bound from the route (`/admin/orders/:orderId`, see app.routes.ts).
  readonly orderId = input('');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly notFound = signal(false);
  readonly order = signal<OrderDetail | null>(null);

  readonly placeholderImage = PRODUCT_IMAGE_PLACEHOLDER;
  readonly formatAmount = formatBalanceAmount;
  readonly statusLabel = orderStatusLabel;
  readonly statusTone = orderStatusTone;
  readonly lineStatusLabel = lineStatusLabel;
  readonly historyByLabel = historyByLabel;
  readonly shipmentStatusLabel = shipmentStatusLabel;

  // This view is read-only and spans every employee under the customer, so
  // — unlike the employee-facing order detail — there's no single viewer
  // allotment to ask `pointsOnly()` about. Derived straight from this
  // order's own totals instead: a real dollar order always has a nonzero
  // `subtotal`, so a zero subtotal alongside a non-null `subtotalPoints`
  // means this particular order was paid entirely in points.
  readonly isPointsOnly = computed(() => {
    const order = this.order();
    return !!order && order.totals.subtotal === 0 && order.totals.subtotalPoints !== null;
  });

  readonly orderLinesById = computed(() => {
    const map = new Map<number, OrderLine>();
    for (const line of this.order()?.lines ?? []) {
      map.set(line.orderLineId, line);
    }
    return map;
  });

  // Oldest -> newest, regardless of what order the API happens to send them
  // in — timestamps are `'YYYY-MM-DD HH:MM:SS'`, so a plain string sort is
  // already a chronological one.
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

    const id = Number(this.orderId());
    if (!this.orderId() || !Number.isFinite(id)) {
      this.notFound.set(true);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.orderService.get(id).subscribe((result) => {
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
    });
  }
}
