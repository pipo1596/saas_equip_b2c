// `APCORDER` — same dispatcher/session pattern as `APCCART`. Write actions
// (`*PLACE`/`*APPROVE`/`*REJECT`/`*CANCEL`) come back wrapped in a
// `success` flag; read actions (`*GET`/`*LIST`/`*APPRQ`) return the data
// object directly, with a failure distinguished only by an explicit
// `success: false` (a real `OrderDetail` never has a `success` key at all).

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';

export type OrderStatus =
  | 'PENDING_APPROVAL'
  | 'PROCESSING'
  | 'PARTIALLY_SHIPPED'
  | 'SHIPPED'
  | 'CANCELLED'
  | 'REJECTED';

export type LineStatus = 'OPEN' | 'BACKORDERED' | 'PARTIALLY_SHIPPED' | 'SHIPPED' | 'CANCELLED';

export interface ApiError {
  success: false;
  code: 'PCH' | 'INS' | 'NFD' | 'BOP' | 'ERR';
  message: string;
}

export interface OrderWriteResult {
  success: true;
  message: string;
  orderId: number;
  orderNumber: string;
  status: OrderStatus;
}

export interface PlaceOrderRequest {
  action: '*PLACE';
  locationId: number;
  checkoutKey: string;
  addressId: number;
  shipMethodId: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  phoneExt?: string;
  notes?: string;
}

export interface OrderLine {
  orderLineId: number;
  lineNo: number;
  skuId: number | null;
  // What `/product/:productPk` takes — links the line's thumbnail/name back
  // to the product page it was ordered from.
  productPk: number;
  skuCode: string;
  productTitle: string;
  optionDesc: string | null;
  // Looked up from the *current* catalog entry, not captured at order
  // time — a product's picture can change (or the product can be removed
  // entirely, which is also when this comes back `null`) after the order
  // was placed, so an old order can show a different photo than what the
  // shopper actually received.
  imageUrl: string | null;
  qtyOrdered: number;
  qtyShipped: number;
  qtyCancelled: number;
  qtyBackordered: number;
  unitPrice: number;
  unitPoints: number | null;
  lineTotal: number;
  linePoints: number | null;
  unitsUsed: number;
  dollarsUsed: number;
  pointsUsed: number;
  lineStatus: LineStatus;
}

export interface PaidFrom {
  ruleId: number;
  ruleName: string;
  amountType: 'DOLLARS' | 'UNITS' | 'POINTS';
  amount: number;
  state: 'RESERVED' | 'CHARGED';
}

export interface Shipment {
  shipmentId: number;
  carrier: string | null;
  serviceCode: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED' | 'EXCEPTION' | 'RETURNED';
  shippedTs: string | null;
  deliveredTs: string | null;
  lines: { orderLineId: number; lineNo: number; qty: number }[];
}

export interface HistoryEntry {
  fromStatus: string | null;
  toStatus: string;
  source: 'PORTAL' | 'APPROVER' | 'FULFIL_API' | 'ADMIN' | 'SYSTEM';
  note: string | null;
  orderLineId: number | null;
  ts: string;
  by: string | null;
}

export interface OrderDetail {
  orderId: number;
  orderNumber: string;
  status: OrderStatus;
  placedTs: string;
  employeeId: number;
  locationId: number | null;
  programId: number;
  requiresApproval: 'Y' | 'N';
  approvedBy: string | null;
  approvedTs: string | null;
  rejectReason: string | null;
  notes: string | null;
  contact: { email: string; firstName: string; lastName: string; phone: string; phoneExt: string | null };
  shipTo: {
    addressId: number | null;
    attention: string | null;
    addressLine1: string;
    addressLine2: string | null;
    addressLine3: string | null;
    city: string;
    province: string;
    postalCode: string;
    country: string;
    phone: string | null;
  };
  shipMethod: { shipMethodId: number | null; name: string; carrier: string | null; serviceCode: string | null };
  totals: {
    currency: string;
    subtotal: number;
    subtotalPoints: number | null;
    shipping: number;
    taxProvince: string | null;
    taxRate: number;
    tax: number;
    total: number;
    allotExclTaxFreight: 'Y' | 'N';
    allotDollarsUsed: number;
    allotPointsUsed: number;
    allotUnitsUsed: number;
    customerBilled: number;
  };
  fulfilment: { ref: string | null; sentTs: string | null; lastError: string | null };
  lines: OrderLine[];
  paidFrom: PaidFrom[];
  shipments: Shipment[];
  history: HistoryEntry[];
}

// The live API sometimes sends `null` for a list field instead of `[]` —
// same quirk `normalizeCart`/`normalizeAllotment` already paper over for
// the cart, normalized once here so nothing downstream defensively
// null-checks every list.
interface RawShipment extends Omit<Shipment, 'lines'> {
  lines: Shipment['lines'] | null;
}

interface RawOrderDetail extends Omit<OrderDetail, 'lines' | 'paidFrom' | 'shipments' | 'history'> {
  lines: OrderLine[] | null;
  paidFrom: PaidFrom[] | null;
  shipments: RawShipment[] | null;
  history: HistoryEntry[] | null;
}

function normalizeOrderDetail(raw: RawOrderDetail): OrderDetail {
  return {
    ...raw,
    lines: raw.lines ?? [],
    paidFrom: raw.paidFrom ?? [],
    shipments: (raw.shipments ?? []).map((shipment) => ({ ...shipment, lines: shipment.lines ?? [] })),
    history: raw.history ?? [],
  };
}

// ---- *LIST / *APPRQ ----

// Same "looked up from the current catalog" caveat as `OrderLine.imageUrl`
// — `null` means the product has no image, or has been removed entirely.
export interface OrderThumb {
  lineNo: number;
  skuId: number | null;
  productTitle: string;
  imageUrl: string | null;
}

export interface OrderSummary {
  orderId: number;
  orderNumber: string;
  status: OrderStatus;
  placedTs: string;
  // Total quantity across every line (e.g. "7 items") — `lineCount` below
  // is how many distinct products that's spread across, not the same
  // number whenever an order has more than one of something.
  itemCount: number;
  lineCount: number;
  // Up to 4 lines, in line order, for the order card's own image strip —
  // not every line, even when there are more than 4 (`lineCount` is what
  // says how many more there are).
  thumbnails: OrderThumb[];
  orderTotal: number;
  // `null` on the same "nothing points-eligible" terms as the cart/checkout
  // subtotal fields — not shown at all in that case, rather than as `0`.
  subtotalPoints: number | null;
  allotDollarsUsed: number;
  allotUnitsUsed: number;
  allotPointsUsed: number;
  shipMethodName: string;
  trackingCount: number;
  // Only present on the `*APPRQ` (approver queue) response, not `*LIST`.
  placedBy?: { employeeId: number; firstName: string; lastName: string; email: string };
}

export interface OrderPagination {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

export type OrderDatePreset = 'ALL' | 'LAST30' | 'LAST90';
export type OrderSort = 'NEWEST' | 'OLDEST';

// What the server actually applied, echoed back — a resolved preset's own
// dateFrom/dateTo (so the date inputs can display the concrete range it
// expanded to) and `datePreset` as `'CUSTOM'` whenever the match came from a
// manually-typed range rather than one of the three preset buttons.
export interface OrderListFilters {
  status: string;
  orderNumber: string;
  dateFrom: string;
  dateTo: string;
  datePreset: OrderDatePreset | 'CUSTOM';
  sort: OrderSort;
}

// One count per status, plus `ALL` for the unfiltered total — always
// present, even on a response with zero matching rows, so the status chips
// stay populated no matter what the current filter is.
export type OrderStatusCounts = Record<'ALL' | OrderStatus, number>;

export interface OrderPage {
  pagination: OrderPagination;
  data: OrderSummary[];
  statusCounts: OrderStatusCounts;
  filters: OrderListFilters;
}

export interface ListOrdersParams {
  // '' lists every status; anything else is an exact `OrderStatus` match.
  status: string;
  // Every field below is optional — blank/omitted leaves it unset, same as
  // the API itself treats them. `datePreset` of `LAST30`/`LAST90` overrides
  // `dateFrom`/`dateTo` server-side, so there's no need to send both.
  orderNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  datePreset?: OrderDatePreset;
  sort?: OrderSort;
  page: number;
  pageSize: number;
}

interface RawOrderSummary extends Omit<OrderSummary, 'thumbnails'> {
  thumbnails: OrderThumb[] | null;
}

interface RawOrderPage extends Omit<OrderPage, 'data' | 'statusCounts' | 'filters'> {
  data: RawOrderSummary[] | null;
  statusCounts: OrderStatusCounts | null;
  filters: OrderListFilters | null;
}

const EMPTY_STATUS_COUNTS: OrderStatusCounts = {
  ALL: 0,
  PENDING_APPROVAL: 0,
  PROCESSING: 0,
  PARTIALLY_SHIPPED: 0,
  SHIPPED: 0,
  CANCELLED: 0,
  REJECTED: 0,
};

const DEFAULT_FILTERS: OrderListFilters = {
  status: '',
  orderNumber: '',
  dateFrom: '',
  dateTo: '',
  datePreset: 'ALL',
  sort: 'NEWEST',
};

function normalizeOrderPage(raw: RawOrderPage): OrderPage {
  return {
    ...raw,
    data: (raw.data ?? []).map((row) => ({ ...row, thumbnails: row.thumbnails ?? [] })),
    statusCounts: raw.statusCounts ?? EMPTY_STATUS_COUNTS,
    filters: raw.filters ?? DEFAULT_FILTERS,
  };
}

// A small generic "no photo" icon — shown in place of a product image
// whenever `imageUrl` is `null` (no image on file, or the product's been
// removed from the catalog since).
export const PRODUCT_IMAGE_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
      '<rect width="48" height="48" rx="6" fill="#edf1f6"/>' +
      '<circle cx="18" cy="17" r="3.5" fill="#cbd5e1"/>' +
      '<path d="M8 36l10-12 7 6 6-8 9 14" fill="none" stroke="#94a3b8" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>',
  );

export type OrderStatusTone = 'amber' | 'red' | 'blue' | 'teal' | 'green' | 'grey';

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_APPROVAL: 'Pending approval',
  PROCESSING: 'Processing',
  PARTIALLY_SHIPPED: 'Partially shipped',
  SHIPPED: 'Shipped',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

const STATUS_TONES: Record<OrderStatus, OrderStatusTone> = {
  PENDING_APPROVAL: 'amber',
  PROCESSING: 'blue',
  PARTIALLY_SHIPPED: 'teal',
  SHIPPED: 'green',
  CANCELLED: 'grey',
  REJECTED: 'red',
};

export function orderStatusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status];
}

export function orderStatusTone(status: OrderStatus): OrderStatusTone {
  return STATUS_TONES[status];
}

// `OPEN` has no badge at all — a line with nothing shipped/cancelled/
// backordered yet is just... in the order, nothing to call out.
const LINE_STATUS_LABELS: Partial<Record<LineStatus, string>> = {
  BACKORDERED: 'Backordered',
  PARTIALLY_SHIPPED: 'Partially shipped',
  SHIPPED: 'Shipped',
  CANCELLED: 'Cancelled',
};

export function lineStatusLabel(status: LineStatus): string | null {
  return LINE_STATUS_LABELS[status] ?? null;
}

const HISTORY_SOURCE_LABELS: Record<HistoryEntry['source'], string> = {
  PORTAL: 'You',
  APPROVER: 'Approver',
  FULFIL_API: 'Warehouse',
  ADMIN: 'Admin',
  SYSTEM: 'System',
};

export function historySourceLabel(source: HistoryEntry['source']): string {
  return HISTORY_SOURCE_LABELS[source];
}

const SHIPMENT_STATUS_LABELS: Record<Shipment['status'], string> = {
  SHIPPED: 'Shipped',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  EXCEPTION: 'Exception',
  RETURNED: 'Returned',
};

export function shipmentStatusLabel(status: Shipment['status']): string {
  return SHIPMENT_STATUS_LABELS[status];
}

// A history entry's `toStatus` is a plain string, not `OrderStatus` — most
// values are one, but a line-level entry can also be something like
// `SHORT_SHIPPED` that has no tile/chip label of its own. Falls back to a
// humanized version of the raw token (`SHORT_SHIPPED` -> `Short shipped`)
// rather than showing the shouting-case value as-is.
export function historyStatusLabel(status: string): string {
  const known = STATUS_LABELS[status as OrderStatus];
  if (known) {
    return known;
  }
  const words = status.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCORDER`;

  // Write actions return a `success` flag either way — passed straight
  // through rather than thrown, so a caller can branch on `code` (`PCH` vs
  // `INS` vs anything else need different handling, not just a message).
  place(req: Omit<PlaceOrderRequest, 'action'>): Observable<OrderWriteResult | ApiError> {
    return this.http.post<OrderWriteResult | ApiError>(this.dispatchUrl, { action: '*PLACE', ...req });
  }

  cancel(orderId: number, notes?: string): Observable<OrderWriteResult | ApiError> {
    return this.http.post<OrderWriteResult | ApiError>(this.dispatchUrl, {
      action: '*CANCEL',
      orderId,
      ...(notes ? { notes } : {}),
    });
  }

  // A real `OrderDetail` never has a `success` key — that's what tells a
  // failed lookup (`NFD`, most notably) apart from the data itself.
  get(orderId: number): Observable<OrderDetail | ApiError> {
    return this.http
      .post<RawOrderDetail | ApiError>(this.dispatchUrl, { action: '*GET', orderId })
      .pipe(map((response) => ('success' in response ? response : normalizeOrderDetail(response))));
  }

  // Newest first, same "no `success` key means real data" rule as `get`.
  // An empty result (`data: []`, `totalRows: 0`) isn't a failure — that's
  // just an employee with no orders yet. Every optional field is left out
  // entirely unless actually in use, rather than sent blank — keeps the
  // request (and the request-shape assertions in tests) minimal.
  list(params: ListOrdersParams): Observable<OrderPage | ApiError> {
    return this.http
      .post<RawOrderPage | ApiError>(this.dispatchUrl, {
        action: '*LIST',
        status: params.status,
        page: params.page,
        pageSize: params.pageSize,
        ...(params.orderNumber ? { orderNumber: params.orderNumber } : {}),
        ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
        ...(params.dateTo ? { dateTo: params.dateTo } : {}),
        ...(params.datePreset ? { datePreset: params.datePreset } : {}),
        ...(params.sort && params.sort !== 'NEWEST' ? { sort: params.sort } : {}),
      })
      .pipe(map((response) => ('success' in response ? response : normalizeOrderPage(response))));
  }
}
