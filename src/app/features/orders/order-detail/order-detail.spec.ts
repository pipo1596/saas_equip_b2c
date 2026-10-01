import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../../core/auth/auth';
import { FAKE_SESSION } from '../../../core/auth/auth.testing';
import { ConfirmService } from '../../../shared/confirm/confirm';
import { OrderDetailPage } from './order-detail';

const BASE_ORDER = {
  orderId: 42,
  orderNumber: 'EQ100001',
  status: 'SUBMITTED' as const,
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
      qtyOrdered: 2,
      qtyShipped: 1,
      qtyCancelled: 0,
      qtyBackordered: 1,
      unitPrice: 89.99,
      unitPoints: null,
      lineTotal: 179.98,
      linePoints: null,
      unitsUsed: 0,
      dollarsUsed: 179.98,
      pointsUsed: 0,
      lineStatus: 'PARTIALLY_SHIPPED' as const,
    },
  ],
  paidFrom: [
    { ruleId: 99, ruleName: 'General Allotment', amountType: 'DOLLARS' as const, amount: 179.98, state: 'CHARGED' as const },
  ],
  shipments: [] as never[],
  history: [
    { fromStatus: null, toStatus: 'SUBMITTED', source: 'PORTAL' as const, note: null, orderLineId: null, ts: '2026-09-30 10:00:00', by: null },
  ],
};

function flushOrderGet(httpMock: HttpTestingController, response: object) {
  const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
  expect(req.request.body).toEqual({ action: '*GET', orderId: 42 });
  req.flush(response as never);
}

describe('OrderDetailPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '');
    await TestBed.configureTestingModule({
      imports: [OrderDetailPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Rendering this page also renders `<app-header/>`, whose own
    // `ngOnInit`/location effect always fires a tenant-settings and a cart
    // `*GET` too — drain those incidental requests before the strict
    // `verify()` below, same as every other page that renders the header
    // (see home.spec.ts for the original precedent).
    httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').forEach((req) => req.flush({}));
    httpMock
      .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART')
      .forEach((req) =>
        req.flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] }),
      );
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '');
  });

  function createPage(orderId = '42') {
    const fixture = TestBed.createComponent(OrderDetailPage);
    fixture.componentRef.setInput('orderId', orderId);
    return { fixture, page: fixture.componentInstance };
  }

  it('should create', () => {
    const { fixture } = createPage();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('loads the order on init and exposes it', () => {
    const { fixture, page } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, BASE_ORDER);

    expect(page.order()?.orderNumber).toBe('EQ100001');
    expect(page.loading()).toBe(false);
  });

  it('shows "Order not found" and a link back to order history for an NFD failure', () => {
    const { fixture } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, { success: false, code: 'NFD', message: 'Order not found.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Order not found');
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.order-detail__empty a[href="/orders"]');
    expect(link).not.toBeNull();
  });

  it('shows the API message for any other failure code', () => {
    const { fixture, page } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, { success: false, code: 'ERR', message: 'Something went wrong.' });
    fixture.detectChanges();

    expect(page.error()).toBe('Something went wrong.');
    expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain('Something went wrong.');
  });

  it('shows the "just placed" banner for a SUBMITTED order arriving from checkout', () => {
    history.pushState({ justPlaced: true }, '');
    const { fixture } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, BASE_ORDER);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Thank you! Your order');
    expect(fixture.nativeElement.textContent).toContain('EQ100001');
  });

  it('shows the "sent for approval" banner for a PENDING_APPROVAL order arriving from checkout', () => {
    history.pushState({ justPlaced: true }, '');
    const { fixture } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, { ...BASE_ORDER, status: 'PENDING_APPROVAL' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('was sent for approval');
  });

  it('does not show the "just placed" banner on a plain reload (no router state)', () => {
    const { fixture } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, BASE_ORDER);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Thank you!');
    expect(fixture.nativeElement.textContent).toContain('Order');
    expect(fixture.nativeElement.textContent).toContain('EQ100001');
  });

  it('shows the reject reason prominently for a rejected order', () => {
    const { fixture } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, {
      ...BASE_ORDER,
      status: 'REJECTED',
      rejectReason: 'Exceeds remaining allotment.',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.order-detail__reject-reason')?.textContent).toContain(
      'Exceeds remaining allotment.',
    );
  });

  it('shows a per-line shipped/backordered note', () => {
    const { fixture } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, BASE_ORDER);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.order-detail__item-status')?.textContent).toBe('1 shipped · 1 backordered');
  });

  it('shows "Covered by N unit(s)" instead of a price when a line is fully unit-covered', () => {
    const { fixture } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, {
      ...BASE_ORDER,
      lines: [{ ...BASE_ORDER.lines[0], unitsUsed: 2, qtyOrdered: 2, lineTotal: 0 }],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.order-detail__item-price')?.textContent).toContain(
      'Covered by 2 units',
    );
  });

  it('labels shipping/tax "(covered by allotment)" when allotExclTaxFreight is N, and shows no separate billed-to-company row', () => {
    const { fixture } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, BASE_ORDER);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('(covered by allotment)');
    expect(fixture.nativeElement.textContent).not.toContain('Billed to company');
  });

  it('labels shipping/tax "(billed to company)" and shows customerBilled when allotExclTaxFreight is Y', () => {
    const { fixture } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, {
      ...BASE_ORDER,
      totals: { ...BASE_ORDER.totals, allotExclTaxFreight: 'Y', customerBilled: 41.3 },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('(billed to company)');
    expect(fixture.nativeElement.textContent).toContain('Billed to company');
    expect(fixture.nativeElement.textContent).toContain('$41.30');
  });

  it('always shows a $0.00 amount due', () => {
    const { fixture } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, BASE_ORDER);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.order-detail__amount-due')?.textContent).toContain('$0.00');
  });

  it('does not repeat the country on the shipping address', () => {
    const { fixture } = createPage();
    fixture.detectChanges();
    flushOrderGet(httpMock, BASE_ORDER);
    fixture.detectChanges();

    const countryOccurrences = (fixture.nativeElement.textContent as string).split('CA').length - 1;
    // "CA" also appears inside "Canada Post" — just confirm the address
    // block doesn't ALSO print the country a second time on its own line.
    const addressLines = Array.from(
      fixture.nativeElement.querySelectorAll('.order-detail__line'),
    ) as HTMLElement[];
    const countryLines = addressLines.filter((el) => el.textContent?.trim() === 'CA');
    expect(countryLines).toHaveLength(1);
    expect(countryOccurrences).toBeGreaterThanOrEqual(1);
  });

  describe('cancelling', () => {
    function setSessionEmpId(empId: string) {
      TestBed.inject(AuthService).session.set({ ...FAKE_SESSION, empId, locations: [] });
    }

    it('shows Cancel order when the viewer owns the order and it is still cancellable', () => {
      setSessionEmpId('1001');
      const { fixture } = createPage();
      fixture.detectChanges();
      flushOrderGet(httpMock, { ...BASE_ORDER, status: 'SUBMITTED' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.order-detail__actions, button')).toBeTruthy();
      expect(fixture.nativeElement.textContent).toContain('Cancel order');
    });

    it('hides Cancel order for someone else\'s order', () => {
      setSessionEmpId('999');
      const { fixture, page } = createPage();
      fixture.detectChanges();
      flushOrderGet(httpMock, { ...BASE_ORDER, status: 'SUBMITTED' });
      fixture.detectChanges();

      expect(page.canCancel()).toBe(false);
    });

    it('hides Cancel order once the order is past a cancellable status', () => {
      setSessionEmpId('1001');
      const { fixture, page } = createPage();
      fixture.detectChanges();
      flushOrderGet(httpMock, { ...BASE_ORDER, status: 'SHIPPED' });
      fixture.detectChanges();

      expect(page.canCancel()).toBe(false);
    });

    it('does nothing when the confirmation is declined', () => {
      setSessionEmpId('1001');
      const { fixture, page } = createPage();
      fixture.detectChanges();
      flushOrderGet(httpMock, { ...BASE_ORDER, status: 'SUBMITTED' });
      fixture.detectChanges();

      page.cancelOrder();
      TestBed.inject(ConfirmService).respond(false);

      httpMock.expectNone((r) => r.url === '/cgi/APPSCDSPCH?SEPGM=APCORDER' && r.body?.action === '*CANCEL');
    });

    it('cancels and reloads the order once confirmed', () => {
      setSessionEmpId('1001');
      const { fixture, page } = createPage();
      fixture.detectChanges();
      flushOrderGet(httpMock, { ...BASE_ORDER, status: 'SUBMITTED' });
      fixture.detectChanges();

      page.cancelOrder();
      TestBed.inject(ConfirmService).respond(true);

      const cancelReq = httpMock.expectOne(
        (r) => r.url === '/cgi/APPSCDSPCH?SEPGM=APCORDER' && r.body?.action === '*CANCEL',
      );
      expect(cancelReq.request.body).toEqual({ action: '*CANCEL', orderId: 42 });
      cancelReq.flush({ success: true, message: 'Order cancelled.', orderId: 42, orderNumber: 'EQ100001', status: 'CANCELLED' });

      flushOrderGet(httpMock, { ...BASE_ORDER, status: 'CANCELLED' });

      expect(page.cancelling()).toBe(false);
      expect(page.order()?.status).toBe('CANCELLED');
    });

    it('shows the API message and stops cancelling on failure, without reloading', () => {
      setSessionEmpId('1001');
      const { fixture, page } = createPage();
      fixture.detectChanges();
      flushOrderGet(httpMock, { ...BASE_ORDER, status: 'SUBMITTED' });
      fixture.detectChanges();

      page.cancelOrder();
      TestBed.inject(ConfirmService).respond(true);

      const cancelReq = httpMock.expectOne(
        (r) => r.url === '/cgi/APPSCDSPCH?SEPGM=APCORDER' && r.body?.action === '*CANCEL',
      );
      cancelReq.flush({ success: false, code: 'ERR', message: 'Too late to cancel.' });

      expect(page.cancelling()).toBe(false);
      expect(page.cancelError()).toBe('Too late to cancel.');
      expect(page.order()?.status).toBe('SUBMITTED');
    });
  });
});
