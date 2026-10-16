import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  ApiError,
  ApprovalQueueResponse,
  OrderDetail,
  OrderPage,
  OrderService,
  OrderWriteResult,
  PRODUCT_IMAGE_PLACEHOLDER,
  approvalStepLabel,
  approvalStepStatusLabel,
  historyByLabel,
  historySourceLabel,
  historyStatusLabel,
  isApprovalDueSoon,
  lineStatusLabel,
  orderStatusLabel,
  orderStatusTone,
  shipmentStatusLabel,
} from './order';

const RAW_ORDER = {
  orderId: 42,
  orderNumber: 'EQ100001',
  status: 'PROCESSING' as const,
  placedTs: '2026-09-30 10:00:00',
  employeeId: 1001,
  locationId: 18,
  programId: 3,
  requiresApproval: 'N' as const,
  approvedBy: null,
  approvedTs: null,
  rejectReason: null,
  notes: null,
  contact: { email: 'pat.doe@example.com', firstName: 'Pat', lastName: 'Doe', phone: '555-0100', phoneExt: null },
  shipTo: {
    addressId: 42,
    attention: 'Receiving Dept.',
    addressLine1: '1250 Rue Sherbrooke O',
    addressLine2: 'Suite 400',
    addressLine3: null,
    city: 'Montreal',
    province: 'QC',
    postalCode: 'H3G 1H6',
    country: 'CA',
    phone: null,
  },
  shipMethod: { shipMethodId: 5, name: 'Standard Ground', carrier: 'Canada Post', serviceCode: 'Regular Parcel' },
  totals: {
    currency: 'CAD',
    subtotal: 179.98,
    subtotalPoints: null,
    shipping: 12.5,
    taxProvince: 'QC',
    taxRate: 14.975,
    tax: 28.8,
    total: 221.28,
    allotExclTaxFreight: 'N' as const,
    allotDollarsUsed: 179.98,
    allotPointsUsed: 0,
    allotUnitsUsed: 0,
    customerBilled: 0,
  },
  fulfilment: { ref: null, sentTs: null, lastError: null },
  lines: [
    {
      orderLineId: 9001,
      lineNo: 1,
      skuId: 9001,
      skuCode: 'ABC-100-BLK-M',
      productTitle: "Men's Trail Jacket",
      optionDesc: 'BLACK / M',
      imageUrl: 'https://cdn.example.com/black-m.jpg',
      qtyOrdered: 2,
      qtyShipped: 0,
      qtyCancelled: 0,
      qtyBackordered: 0,
      unitPrice: 89.99,
      unitPoints: null,
      lineTotal: 179.98,
      linePoints: null,
      unitsUsed: 0,
      dollarsUsed: 179.98,
      pointsUsed: 0,
      lineStatus: 'OPEN' as const,
    },
  ],
  paidFrom: [{ ruleId: 99, ruleName: 'General Allotment', amountType: 'DOLLARS' as const, amount: 179.98, state: 'CHARGED' as const }],
  shipments: [] as never[],
  history: [
    { fromStatus: null, toStatus: 'PROCESSING', source: 'PORTAL' as const, note: null, orderLineId: null, ts: '2026-09-30 10:00:00', by: null },
  ],
  viewerCanAct: 'N' as const,
  approvals: [] as never[],
};

describe('OrderService', () => {
  let service: OrderService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OrderService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('place', () => {
    it('posts *PLACE with the given payload', () => {
      service
        .place({
          locationId: 18,
          checkoutKey: 'key-1',
          addressId: 42,
          shipMethodId: 5,
          email: 'pat.doe@example.com',
          firstName: 'Pat',
          lastName: 'Doe',
          phone: '555-0100',
        })
        .subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({
        action: '*PLACE',
        locationId: 18,
        checkoutKey: 'key-1',
        addressId: 42,
        shipMethodId: 5,
        email: 'pat.doe@example.com',
        firstName: 'Pat',
        lastName: 'Doe',
        phone: '555-0100',
      });
      req.flush({ success: true, message: 'Order EQ100001 placed.', orderId: 42, orderNumber: 'EQ100001', status: 'PROCESSING' });
    });

    it('passes a failure straight through, with its code intact', () => {
      let result: OrderWriteResult | ApiError | undefined;
      service
        .place({
          locationId: 18,
          checkoutKey: 'key-1',
          addressId: 42,
          shipMethodId: 5,
          email: 'pat.doe@example.com',
          firstName: 'Pat',
          lastName: 'Doe',
          phone: '555-0100',
        })
        .subscribe((res) => (result = res));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER')
        .flush({ success: false, code: 'INS', message: 'Not enough allotment for SKU ABC-100.' });

      expect(result).toEqual({ success: false, code: 'INS', message: 'Not enough allotment for SKU ABC-100.' });
    });
  });

  describe('cancel', () => {
    it('posts *CANCEL with the orderId, omitting notes when not given', () => {
      service.cancel(42).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({ action: '*CANCEL', orderId: 42 });
      req.flush({ success: true, message: 'Order cancelled.', orderId: 42, orderNumber: 'EQ100001', status: 'CANCELLED' });
    });

    it('includes notes when given', () => {
      service.cancel(42, 'Changed my mind').subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({ action: '*CANCEL', orderId: 42, notes: 'Changed my mind' });
      req.flush({ success: true, message: 'Order cancelled.', orderId: 42, orderNumber: 'EQ100001', status: 'CANCELLED' });
    });
  });

  describe('get', () => {
    it('posts *GET and returns the order detail untouched when its lists are already arrays', () => {
      let result: OrderDetail | ApiError | undefined;
      service.get(42).subscribe((res) => (result = res));

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({ action: '*GET', orderId: 42 });
      req.flush(RAW_ORDER);

      expect(result).toEqual(RAW_ORDER);
    });

    it('normalizes null lines/paidFrom/shipments/history/approvals to []', () => {
      let result: OrderDetail | ApiError | undefined;
      service.get(42).subscribe((res) => (result = res));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER').flush({
        ...RAW_ORDER,
        lines: null,
        paidFrom: null,
        shipments: null,
        history: null,
        approvals: null,
      });

      expect(result).toMatchObject({ lines: [], paidFrom: [], shipments: [], history: [], approvals: [] });
    });

    it('normalizes a null shipment.lines to []', () => {
      let result: OrderDetail | ApiError | undefined;
      service.get(42).subscribe((res) => (result = res));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER').flush({
        ...RAW_ORDER,
        shipments: [
          {
            shipmentId: 1,
            carrier: 'Canada Post',
            serviceCode: 'Regular Parcel',
            trackingNumber: '1Z999',
            trackingUrl: null,
            status: 'SHIPPED',
            shippedTs: '2026-09-30 12:00:00',
            deliveredTs: null,
            lines: null,
          },
        ],
      });

      expect((result as OrderDetail).shipments[0].lines).toEqual([]);
    });

    it('passes a failure (e.g. NFD) straight through instead of normalizing it', () => {
      let result: OrderDetail | ApiError | undefined;
      service.get(999).subscribe((res) => (result = res));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER')
        .flush({ success: false, code: 'NFD', message: 'Order not found.' });

      expect(result).toEqual({ success: false, code: 'NFD', message: 'Order not found.' });
    });
  });

  describe('list', () => {
    const SUMMARY = {
      orderId: 42,
      orderNumber: 'EQ100001',
      status: 'PROCESSING' as const,
      placedTs: '2026-09-30 10:00:00',
      itemCount: 2,
      lineCount: 1,
      thumbnails: [
        { lineNo: 1, skuId: 9001, productTitle: "Men's Trail Jacket", imageUrl: 'https://cdn.example.com/black-m.jpg' },
      ],
      orderTotal: 221.28,
      allotDollarsUsed: 179.98,
      allotUnitsUsed: 0,
      shipMethodName: 'Standard Ground',
      trackingCount: 0,
    };

    it('posts *LIST with the status/page/pageSize params', () => {
      service.list({ status: '', page: 1, pageSize: 25 }).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({ action: '*LIST', status: '', page: 1, pageSize: 25 });
      req.flush({ pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [SUMMARY] });
    });

    it('normalizes a null data array to []', () => {
      let result: OrderPage | ApiError | undefined;
      service.list({ status: '', page: 1, pageSize: 25 }).subscribe((res) => (result = res));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER')
        .flush({ pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: null });

      expect(result).toEqual({
        pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 },
        data: [],
        statusCounts: {
          ALL: 0,
          PENDING_APPROVAL: 0,
          PROCESSING: 0,
          PARTIALLY_SHIPPED: 0,
          SHIPPED: 0,
          CANCELLED: 0,
          REJECTED: 0,
        },
        filters: { status: '', orderNumber: '', dateFrom: '', dateTo: '', datePreset: 'ALL', sort: 'NEWEST' },
      });
    });

    it('passes a failure straight through', () => {
      let result: OrderPage | ApiError | undefined;
      service.list({ status: 'PROCESSING', page: 1, pageSize: 25 }).subscribe((res) => (result = res));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER')
        .flush({ success: false, code: 'ERR', message: 'Not logged in.' });

      expect(result).toEqual({ success: false, code: 'ERR', message: 'Not logged in.' });
    });

    it('a BOP failure (e.g. an invalid date range) comes through the same way as any other', () => {
      let result: OrderPage | ApiError | undefined;
      service
        .list({ status: '', dateFrom: '2026-02-01', dateTo: '2026-01-01', page: 1, pageSize: 25 })
        .subscribe((res) => (result = res));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER')
        .flush({ success: false, code: 'BOP', message: '"From" must be on or before "To".' });

      expect(result).toEqual({ success: false, code: 'BOP', message: '"From" must be on or before "To".' });
    });

    it('only includes the optional filter fields that are actually set', () => {
      service
        .list({
          status: 'PROCESSING',
          orderNumber: '1003',
          dateFrom: '2026-01-01',
          dateTo: '2026-02-01',
          sort: 'OLDEST',
          page: 1,
          pageSize: 25,
        })
        .subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({
        action: '*LIST',
        status: 'PROCESSING',
        orderNumber: '1003',
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
        sort: 'OLDEST',
        page: 1,
        pageSize: 25,
      });
      req.flush({ pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: [] });
    });

    it('leaves NEWEST (the default sort) out of the request entirely', () => {
      service.list({ status: '', datePreset: 'LAST30', sort: 'NEWEST', page: 1, pageSize: 25 }).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({
        action: '*LIST',
        status: '',
        datePreset: 'LAST30',
        page: 1,
        pageSize: 25,
      });
      req.flush({ pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: [] });
    });

    it('passes statusCounts and the resolved filters straight through when present', () => {
      let result: OrderPage | ApiError | undefined;
      service.list({ status: '', page: 1, pageSize: 25 }).subscribe((res) => (result = res));

      // The API sends the all-statuses total as a lowercase `all` key,
      // unlike every other (uppercase) status key alongside it — normalized
      // to `ALL` below so this asserts against the shape callers actually see.
      const rawStatusCounts = {
        all: 11,
        PENDING_APPROVAL: 1,
        PROCESSING: 6,
        PARTIALLY_SHIPPED: 1,
        SHIPPED: 1,
        CANCELLED: 1,
        REJECTED: 1,
      };
      const filters = {
        status: '',
        orderNumber: '',
        dateFrom: '2026-09-09',
        dateTo: '2026-10-08',
        datePreset: 'LAST30' as const,
        sort: 'NEWEST' as const,
      };
      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER').flush({
        pagination: { page: 1, pageSize: 25, totalRows: 11, totalPages: 1 },
        data: [SUMMARY],
        statusCounts: rawStatusCounts,
        filters,
      });

      expect((result as OrderPage).statusCounts).toEqual({
        ALL: 11,
        PENDING_APPROVAL: 1,
        PROCESSING: 6,
        PARTIALLY_SHIPPED: 1,
        SHIPPED: 1,
        CANCELLED: 1,
        REJECTED: 1,
      });
      expect((result as OrderPage).filters).toEqual(filters);
    });

    it('normalizes a null thumbnails array on a row to []', () => {
      let result: OrderPage | ApiError | undefined;
      service.list({ status: '', page: 1, pageSize: 25 }).subscribe((res) => (result = res));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER').flush({
        pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
        data: [{ ...SUMMARY, thumbnails: null }],
      });

      expect((result as OrderPage).data[0].thumbnails).toEqual([]);
    });
  });

  describe('listApprovals', () => {
    const QUEUE_ROW = {
      orderId: 86,
      orderNumber: 'SO-104901',
      status: 'PENDING_APPROVAL' as const,
      placedTs: '2026-10-02 09:14:00',
      itemCount: 2,
      lineCount: 2,
      moreCount: 0,
      orderTotal: 420,
      subtotalPoints: 0,
      allotDollarsUsed: 420,
      allotPointsUsed: 0,
      allotUnitsUsed: 0,
      shipMethodName: 'Ground',
      trackingCount: 0,
      thumbnails: [{ lineNo: 1, skuId: 501, productTitle: 'Duty jacket', imageUrl: 'https://cdn.example.com/x.jpg' }],
      placedBy: {
        employeeId: 19235,
        employeeNumber: 'E1042',
        firstName: 'Alex',
        lastName: 'Morgan',
        email: 'alex@example.com',
      },
      approvalStep: {
        stepNo: 1,
        kind: 'LEVEL' as const,
        levelNo: 1,
        roleNames: 'Lieutenant',
        scope: 'LOCATION' as const,
        locationId: 12,
        waitingSince: '2026-10-02 09:14:00',
        dueTs: '2026-10-06 09:14:00',
      },
    };

    it('posts *APPRQ with page/pageSize', () => {
      service.listApprovals(1, 25).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({ action: '*APPRQ', page: 1, pageSize: 25 });
      req.flush({ pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [QUEUE_ROW] });
    });

    it('returns the queue rows untouched when data is already an array', () => {
      let result: ApprovalQueueResponse | ApiError | undefined;
      service.listApprovals(1, 25).subscribe((res) => (result = res));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER').flush({
        pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
        data: [QUEUE_ROW],
      });

      expect((result as ApprovalQueueResponse).data).toEqual([QUEUE_ROW]);
    });

    it('normalizes a null data array to []', () => {
      let result: ApprovalQueueResponse | ApiError | undefined;
      service.listApprovals(1, 25).subscribe((res) => (result = res));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER')
        .flush({ pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: null });

      expect((result as ApprovalQueueResponse).data).toEqual([]);
    });

    it('passes an empty-queue failure straight through', () => {
      let result: ApprovalQueueResponse | ApiError | undefined;
      service.listApprovals(1, 25).subscribe((res) => (result = res));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER')
        .flush({ success: false, code: 'ERR', message: 'Not logged in.' });

      expect(result).toEqual({ success: false, code: 'ERR', message: 'Not logged in.' });
    });
  });

  describe('approve', () => {
    it('posts *APPROVE with the orderId, omitting notes when not given', () => {
      service.approve(86).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({ action: '*APPROVE', orderId: 86 });
      req.flush({
        success: true,
        message: 'Order SO-104901 approved and forwarded to level 2 for further approval.',
        orderId: 86,
        orderNumber: 'SO-104901',
        status: 'PENDING_APPROVAL',
      });
    });

    it('includes notes when given', () => {
      service.approve(86, 'Looks good').subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({ action: '*APPROVE', orderId: 86, notes: 'Looks good' });
      req.flush({ success: true, message: 'Order approved.', orderId: 86, orderNumber: 'SO-104901', status: 'PROCESSING' });
    });

    it('passes a failure straight through', () => {
      let result: OrderWriteResult | ApiError | undefined;
      service.approve(86).subscribe((res) => (result = res));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER')
        .flush({ success: false, code: 'ERR', message: 'Order SO-104901 is no longer pending approval.' });

      expect(result).toEqual({ success: false, code: 'ERR', message: 'Order SO-104901 is no longer pending approval.' });
    });
  });

  describe('reject', () => {
    it('posts *REJECT with the orderId and the required reason', () => {
      service.reject(86, 'Over budget for this quarter').subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({ action: '*REJECT', orderId: 86, notes: 'Over budget for this quarter' });
      req.flush({ success: true, message: 'Order rejected.', orderId: 86, orderNumber: 'SO-104901', status: 'REJECTED' });
    });

    it('passes a failure straight through', () => {
      let result: OrderWriteResult | ApiError | undefined;
      service.reject(86, 'Reason').subscribe((res) => (result = res));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER')
        .flush({ success: false, code: 'ERR', message: 'A reason is required to reject an order.' });

      expect(result).toEqual({ success: false, code: 'ERR', message: 'A reason is required to reject an order.' });
    });
  });
});

describe('PRODUCT_IMAGE_PLACEHOLDER', () => {
  it('is a data URI usable as an <img> src', () => {
    expect(PRODUCT_IMAGE_PLACEHOLDER).toMatch(/^data:image\/svg\+xml,/);
  });
});

describe('order label/tone helpers', () => {
  it('labels every order status', () => {
    expect(orderStatusLabel('PENDING_APPROVAL')).toBe('Pending approval');
    expect(orderStatusLabel('PROCESSING')).toBe('Processing');
    expect(orderStatusLabel('PARTIALLY_SHIPPED')).toBe('Partially shipped');
    expect(orderStatusLabel('SHIPPED')).toBe('Shipped');
    expect(orderStatusLabel('CANCELLED')).toBe('Cancelled');
    expect(orderStatusLabel('REJECTED')).toBe('Rejected');
  });

  it('tones every order status', () => {
    expect(orderStatusTone('PENDING_APPROVAL')).toBe('amber');
    expect(orderStatusTone('PROCESSING')).toBe('blue');
    expect(orderStatusTone('PARTIALLY_SHIPPED')).toBe('teal');
    expect(orderStatusTone('SHIPPED')).toBe('green');
    expect(orderStatusTone('CANCELLED')).toBe('grey');
    expect(orderStatusTone('REJECTED')).toBe('red');
  });

  it('has no label for an OPEN line, and a label for every other line status', () => {
    expect(lineStatusLabel('OPEN')).toBeNull();
    expect(lineStatusLabel('BACKORDERED')).toBe('Backordered');
    expect(lineStatusLabel('PARTIALLY_SHIPPED')).toBe('Partially shipped');
    expect(lineStatusLabel('SHIPPED')).toBe('Shipped');
    expect(lineStatusLabel('CANCELLED')).toBe('Cancelled');
  });

  it('labels every history source', () => {
    expect(historySourceLabel('PORTAL')).toBe('You');
    expect(historySourceLabel('APPROVER')).toBe('Approver');
    expect(historySourceLabel('FULFIL_API')).toBe('Warehouse');
    expect(historySourceLabel('ADMIN')).toBe('Admin');
    expect(historySourceLabel('SYSTEM')).toBe('System');
  });

  it('labels a history entry placed during a shop-as session, regardless of its source', () => {
    const entry = {
      fromStatus: null,
      toStatus: 'PROCESSING',
      source: 'PORTAL' as const,
      note: null,
      orderLineId: null,
      ts: '2026-10-15 10:00:00',
      by: 'SHOP:L1:9001/EMP:345',
    };
    expect(historyByLabel(entry)).toBe('Placed by admin on behalf of the employee');
  });

  it('falls back to the normal source label for a history entry with no shop-as prefix', () => {
    const entry = {
      fromStatus: null,
      toStatus: 'PROCESSING',
      source: 'PORTAL' as const,
      note: null,
      orderLineId: null,
      ts: '2026-10-15 10:00:00',
      by: null,
    };
    expect(historyByLabel(entry)).toBe('You');
  });

  it('labels every shipment status', () => {
    expect(shipmentStatusLabel('SHIPPED')).toBe('Shipped');
    expect(shipmentStatusLabel('IN_TRANSIT')).toBe('In transit');
    expect(shipmentStatusLabel('DELIVERED')).toBe('Delivered');
    expect(shipmentStatusLabel('EXCEPTION')).toBe('Exception');
    expect(shipmentStatusLabel('RETURNED')).toBe('Returned');
  });

  it('uses the known label for a real order status, and humanizes an unknown line-level token otherwise', () => {
    expect(historyStatusLabel('PROCESSING')).toBe('Processing');
    expect(historyStatusLabel('SHORT_SHIPPED')).toBe('Short shipped');
  });
});

describe('approval helpers', () => {
  it('labels a LEVEL step by its levelNo, and an OVERRIDE step as Administrator', () => {
    expect(approvalStepLabel({ kind: 'LEVEL', levelNo: 2 })).toBe('Level 2');
    expect(approvalStepLabel({ kind: 'OVERRIDE', levelNo: null })).toBe('Administrator');
  });

  it('labels every approval step status', () => {
    expect(approvalStepStatusLabel('PENDING')).toBe('Waiting');
    expect(approvalStepStatusLabel('APPROVED')).toBe('Approved');
    expect(approvalStepStatusLabel('REJECTED')).toBe('Rejected');
    expect(approvalStepStatusLabel('SKIPPED')).toBe('Skipped – no approver');
    expect(approvalStepStatusLabel('EXPIRED')).toBe('Timed out – moved up');
    expect(approvalStepStatusLabel('CANCELLED')).toBe('Cancelled');
  });

  it('flags a null dueTs as not due soon', () => {
    expect(isApprovalDueSoon(null)).toBe(false);
  });

  it('flags today and tomorrow as due soon, but not the day after or yesterday', () => {
    const now = new Date(2026, 9, 10); // 2026-10-10
    expect(isApprovalDueSoon('2026-10-10 17:00:00', now)).toBe(true);
    expect(isApprovalDueSoon('2026-10-11 09:00:00', now)).toBe(true);
    expect(isApprovalDueSoon('2026-10-12 09:00:00', now)).toBe(false);
    expect(isApprovalDueSoon('2026-10-09 09:00:00', now)).toBe(false);
  });
});
