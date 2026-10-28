import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminOrderDetail } from './order-detail';

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
    ccOverageAmt: 0,
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
      lineShipAmt: 0,
      lineTaxAmt: 0,
      ccOverageAmt: 0,
      lineStatus: 'OPEN' as const,
    },
  ],
  paidFrom: [
    {
      ruleId: 99,
      ruleName: 'General Allotment',
      amountType: 'DOLLARS' as const,
      amount: 179.98,
      state: 'CHARGED' as const,
      isFallback: 'N' as const,
      fallbackForRuleId: null,
      fallbackForRuleName: null,
      orderLineId: null,
      itemTitle: null,
    },
  ],
  shipments: [] as never[],
  history: [
    {
      fromStatus: null,
      toStatus: 'PROCESSING',
      source: 'PORTAL' as const,
      note: null,
      orderLineId: null,
      ts: '2026-09-30 10:00:00',
      by: null,
    },
  ],
  viewerCanAct: 'N' as const,
  approvals: [] as never[],
};

function flushCart(httpMock: HttpTestingController) {
  httpMock
    .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART')
    .forEach((req) => req.flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] }));
}

function flushOrderGet(httpMock: HttpTestingController, response: object) {
  const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
  expect(req.request.body.action).toBe('*GET');
  req.flush(response as never);
  return req;
}

function createPage(orderId: string): ComponentFixture<AdminOrderDetail> {
  const fixture = TestBed.createComponent(AdminOrderDetail);
  fixture.componentRef.setInput('orderId', orderId);
  return fixture;
}

describe('AdminOrderDetail', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminOrderDetail],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Rendering this page also renders `<app-header/>`, whose own ngOnInit/
    // location effect always fires a tenant-settings and a cart `*GET` too —
    // drain those incidental requests before the strict `verify()` below,
    // even on a not-found `orderId` where this page's own `*GET` never
    // fires at all.
    httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').forEach((req) => req.flush({}));
    flushCart(httpMock);
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows the order returned by `*GET`', () => {
    const fixture = createPage('42');
    fixture.detectChanges();
    const req = flushOrderGet(httpMock, RAW_ORDER);
    expect(req.request.body.orderId).toBe(42);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('EQ100001');
    expect(fixture.nativeElement.textContent).toContain("Men's Trail Jacket");
    expect(fixture.nativeElement.textContent).toContain('Pat Doe');
  });

  it('links back to the orders list', () => {
    const fixture = createPage('42');
    fixture.detectChanges();
    flushOrderGet(httpMock, RAW_ORDER);
    fixture.detectChanges();

    const backLink: HTMLAnchorElement = fixture.nativeElement.querySelector('.admin-order-detail__back');
    expect(backLink.getAttribute('href')).toBe('/admin/orders');
    expect(backLink.textContent).toContain('Back to Orders');
  });

  it('shows a not-found state for a non-numeric orderId, without calling the API', () => {
    const fixture = createPage('not-a-number');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("That order couldn't be found.");
  });

  it('shows a not-found state for an NFD failure', () => {
    const fixture = createPage('999');
    fixture.detectChanges();
    flushOrderGet(httpMock, { success: false, code: 'NFD', message: 'Order not found.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("That order couldn't be found.");
  });

  it('shows a backend failure as an error banner', () => {
    const fixture = createPage('42');
    fixture.detectChanges();
    flushOrderGet(httpMock, { success: false, code: 'ERR', message: 'Session is not associated with a customer.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
      'Session is not associated with a customer.',
    );
  });

  it('shows the points total for an order paid entirely in points', () => {
    const fixture = createPage('42');
    fixture.detectChanges();
    flushOrderGet(httpMock, {
      ...RAW_ORDER,
      totals: { ...RAW_ORDER.totals, subtotal: 0, subtotalPoints: 450 },
      lines: [{ ...RAW_ORDER.lines[0], unitPoints: 225, linePoints: 450, unitsUsed: 0 }],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('450 pts');
  });
});
