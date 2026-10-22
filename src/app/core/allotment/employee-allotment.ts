// `APCEMPALT` — the signed-in employee's own allotment: the exact same
// summary block the cart carries as `allotment` (see core/cart/allotment.ts
// — `summary` here is normalized the same way), plus a paged transaction
// history and a separate "waiting for approval" list. `*GET` (page load)
// returns both the summary and page 1 of transactions; `*TXNS` (paging or
// changing the rule/scope filter) returns transactions only, so the summary
// isn't needlessly rebuilt. TP/customer/employee come from the portal
// session — never sent in the body. Read-only: a failure comes back as
// `{ success: false, message }` with no partial data.

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Allotment, PayUnit, RawAllotment, normalizeAllotment } from '../cart/allotment';
import { OrderStatus } from '../order/order';

export type AllotmentTxnScope = 'CURRENT' | 'ALL';

export type AllotmentTxnType =
  'DEBIT' | 'CREDIT' | 'ADJUSTMENT' | 'RENEWAL' | 'CARRYOVER' | 'EXPIRE';

export interface AllotmentTransaction {
  transactionId: number;
  // `'YYYY-MM-DD HH:MM:SS'`, server time, no zone — see
  // `formatAllotmentTimestamp`.
  postedTs: string;
  txnType: AllotmentTxnType;
  ruleId: number;
  ruleName: string;
  amountType: PayUnit;
  // Always positive — the magnitude. Use `signedAmount` for direction.
  amount: number;
  signedAmount: number;
  // Same unit as `amountType`. For `UNITS` this is the category's own
  // remaining count, not the rule's pooled total. `null` on older rows.
  balanceAfter: number | null;
  orderId: number | null;
  orderNumber: string | null;
  programName: string | null;
  progCatId: number | null;
  categoryName: string | null;
  cycleStart: string;
  cycleEnd: string;
  reason: string | null;
}

// One hold per order + rule + unit + category — already counted in the
// summary's `reserved`. Disappears (without ever posting) if the order is
// rejected or cancelled; turns into a `DEBIT` transaction once approved.
export interface AllotmentPendingHold {
  orderId: number;
  orderNumber: string;
  placedTs: string;
  orderStatus: OrderStatus;
  ruleId: number;
  ruleName: string;
  amountType: PayUnit;
  amount: number;
  signedAmount: number;
  progCatId: number | null;
  categoryName: string | null;
}

export interface AllotmentTxnPagination {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

export interface AllotmentTransactionsPage {
  scope: AllotmentTxnScope;
  ruleId: number | null;
  pagination: AllotmentTxnPagination;
  data: AllotmentTransaction[];
  pending: AllotmentPendingHold[];
}

export interface EmployeeAllotment {
  summary: Allotment;
  transactions: AllotmentTransactionsPage;
}

export interface ApiFailure {
  success: false;
  message: string | null;
}

export interface TransactionsFilter {
  // 0 = every rule.
  ruleId: number;
  scope: AllotmentTxnScope;
  page: number;
  pageSize?: number;
}

interface RawAllotmentTransactionsPage extends Omit<AllotmentTransactionsPage, 'data' | 'pending'> {
  data: AllotmentTransaction[] | null;
  pending: AllotmentPendingHold[] | null;
}

interface RawEmployeeAllotment {
  summary: RawAllotment;
  transactions: RawAllotmentTransactionsPage;
}

function normalizeTransactionsPage(raw: RawAllotmentTransactionsPage): AllotmentTransactionsPage {
  return {
    ...raw,
    data: raw.data ?? [],
    pending: raw.pending ?? [],
  };
}

const DEFAULT_PAGE_SIZE = 25;

@Injectable({ providedIn: 'root' })
export class EmployeeAllotmentService {
  private readonly http = inject(HttpClient);
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCEMPALT`;

  // Full summary + page 1 of transactions — the "page just opened" case. A
  // later refresh (e.g. after placing, cancelling, or having an order
  // rejected elsewhere) calls this again rather than `loadTransactions`,
  // since the summary and pending list are what actually changed.
  // `pageSize` applies to the bundled transactions page the same way it
  // does on `*TXNS` — omit it to take the server's default (25).
  load(pageSize?: number): Observable<EmployeeAllotment | ApiFailure> {
    return this.http
      .post<RawEmployeeAllotment | ApiFailure>(this.dispatchUrl, {
        action: '*GET',
        ...(pageSize !== undefined ? { pageSize } : {}),
      })
      .pipe(
        map((response) =>
          // Unlike `APCORDER`, a successful `APCEMPALT` response carries its
          // own `success: true` too — `'success' in response` would read as
          // a failure either way, so this checks for `summary` (present
          // only on success) instead.
          'summary' in response
            ? {
                // `summary` is always present on a successful response —
                // `normalizeAllotment`'s `null` case only matters for the
                // cart's genuinely-nullable `allotment` field.
                summary: normalizeAllotment(response.summary)!,
                transactions: normalizeTransactionsPage(response.transactions),
              }
            : response,
        ),
      );
  }

  // Transactions only — paging or changing the rule/scope filter never
  // rebuilds the summary.
  loadTransactions(filter: TransactionsFilter): Observable<AllotmentTransactionsPage | ApiFailure> {
    return this.http
      .post<RawAllotmentTransactionsPage | ApiFailure>(this.dispatchUrl, {
        action: '*TXNS',
        ruleId: filter.ruleId,
        scope: filter.scope,
        page: filter.page,
        pageSize: filter.pageSize ?? DEFAULT_PAGE_SIZE,
      })
      .pipe(
        // Same reasoning as `load()` above — `data` (not `success`) is what
        // only a real success response carries.
        map((response) => ('data' in response ? normalizeTransactionsPage(response) : response)),
      );
  }
}

// `ADJUSTMENT` is handled separately below (it needs `signedAmount` to pick
// a direction), so it's deliberately left out of this map.
const TXN_TYPE_LABELS: Omit<Record<AllotmentTxnType, string>, 'ADJUSTMENT'> = {
  DEBIT: 'Order',
  CREDIT: 'Refund',
  RENEWAL: 'Allotment renewed',
  CARRYOVER: 'Carried over from last cycle',
  EXPIRE: 'Expired at end of cycle',
};

// `ADJUSTMENT` moves either direction ("follow signedAmount" per the
// integration doc's own display rules) — split into "Adjustment (Credit)"/
// "Adjustment (Debit)" so it reads the same as every other type-plus-
// direction label, rather than one generic label that could mean either.
export function allotmentTxnLabel(txnType: AllotmentTxnType, signedAmount: number): string {
  if (txnType === 'ADJUSTMENT') {
    return signedAmount >= 0 ? 'Adjustment (Credit)' : 'Adjustment (Debit)';
  }
  return TXN_TYPE_LABELS[txnType];
}

const DOLLAR_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// The signed figure a history row or pending hold moved the balance by —
// "+$96.00" / "−1 Boots" / "+140 pts". Unlike `formatBalanceAmount`
// (core/cart/allotment.ts), a `UNITS` row names its own category instead of
// the generic word "units" (the doc's own example, "−1 Boots"), and
// every value carries an explicit sign rather than only a negative one.
export function formatSignedAllotmentAmount(row: {
  amountType: PayUnit;
  signedAmount: number;
  categoryName: string | null;
}): string {
  const sign = row.signedAmount > 0 ? '+' : row.signedAmount < 0 ? '−' : '';
  const magnitude = Math.abs(row.signedAmount);
  if (row.amountType === 'DOLLARS') {
    return `${sign}${DOLLAR_FORMATTER.format(magnitude)}`;
  }
  if (row.amountType === 'POINTS') {
    return `${sign}${magnitude} pts`;
  }
  // Arrives as e.g. 1.00 — whole units only.
  const whole = Math.round(magnitude);
  return row.categoryName ? `${sign}${whole} ${row.categoryName}` : `${sign}${whole} units`;
}

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

// `postedTs`/`placedTs` are naive server timestamps ('YYYY-MM-DD HH:MM:SS',
// no zone) — formatted by treating those numbers as UTC wall-clock time
// (never the viewer's own zone) so the displayed date/time always matches
// exactly what the server sent, regardless of where the browser sits.
export function formatAllotmentTimestamp(ts: string): string {
  const [datePart, timePart = '00:00:00'] = ts.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  return TIMESTAMP_FORMATTER.format(Date.UTC(year, month - 1, day, hour, minute));
}
