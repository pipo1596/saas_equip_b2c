import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  ApiError,
  OrderDetail,
  OrderPage,
  OrderService,
  OrderWriteResult,
  PRODUCT_IMAGE_PLACEHOLDER,
  historySourceLabel,
  historyStatusLabel,
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

    it('normalizes null lines/paidFrom/shipments/history to []', () => {
      let result: OrderDetail | ApiError | undefined;
      service.get(42).subscribe((res) => (result = res));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER').flush({
        ...RAW_ORDER,
        lines: null,
        paidFrom: null,
        shipments: null,
        history: null,
      });

      expect(result).toMatchObject({ lines: [], paidFrom: [], shipments: [], history: [] });
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

      expect(result).toEqual({ pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: [] });
    });

    it('passes a failure straight through', () => {
      let result: OrderPage | ApiError | undefined;
      service.list({ status: 'PROCESSING', page: 1, pageSize: 25 }).subscribe((res) => (result = res));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER')
        .flush({ success: false, code: 'ERR', message: 'Not logged in.' });

      expect(result).toEqual({ success: false, code: 'ERR', message: 'Not logged in.' });
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
