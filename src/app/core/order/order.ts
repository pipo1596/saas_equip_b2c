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
  | 'REJECTED'
  | 'SUBMITTED'
  | 'SEND_FAILED'
  | 'SENT'
  | 'PARTIALLY_SHIPPED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

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
  skuCode: string;
  productTitle: string;
  optionDesc: string | null;
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
export interface OrderSummary {
  orderId: number;
  orderNumber: string;
  status: OrderStatus;
  placedTs: string;
  itemCount: number;
  orderTotal: number;
  allotDollarsUsed: number;
  allotUnitsUsed: number;
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

export interface OrderPage {
  pagination: OrderPagination;
  data: OrderSummary[];
}

export interface ListOrdersParams {
  // '' lists every status; anything else is an exact `OrderStatus` match.
  status: string;
  page: number;
  pageSize: number;
}

interface RawOrderPage extends Omit<OrderPage, 'data'> {
  data: OrderSummary[] | null;
}

function normalizeOrderPage(raw: RawOrderPage): OrderPage {
  return { ...raw, data: raw.data ?? [] };
}

export type OrderStatusTone = 'amber' | 'red' | 'blue' | 'teal' | 'green' | 'grey';

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_APPROVAL: 'Awaiting approval',
  REJECTED: 'Rejected',
  SUBMITTED: 'Processing',
  // Shown the same as SUBMITTED — it's an internal retry state, not
  // something the employee needs to act on.
  SEND_FAILED: 'Processing',
  SENT: 'Sent to warehouse',
  PARTIALLY_SHIPPED: 'Partially shipped',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const STATUS_TONES: Record<OrderStatus, OrderStatusTone> = {
  PENDING_APPROVAL: 'amber',
  REJECTED: 'red',
  SUBMITTED: 'blue',
  SEND_FAILED: 'blue',
  SENT: 'blue',
  PARTIALLY_SHIPPED: 'teal',
  SHIPPED: 'green',
  DELIVERED: 'green',
  CANCELLED: 'grey',
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
  // just an employee with no orders yet.
  list(params: ListOrdersParams): Observable<OrderPage | ApiError> {
    return this.http
      .post<RawOrderPage | ApiError>(this.dispatchUrl, { action: '*LIST', ...params })
      .pipe(map((response) => ('success' in response ? response : normalizeOrderPage(response))));
  }
}
