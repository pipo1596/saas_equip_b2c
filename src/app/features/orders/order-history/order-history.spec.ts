import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { OrderHistoryPage } from './order-history';

const SUMMARY = {
  orderId: 42,
  orderNumber: 'EQ100001',
  status: 'SHIPPED' as const,
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
  trackingCount: 1,
};

function flushOrdersList(httpMock: HttpTestingController, response: object) {
  const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
  expect(req.request.body.action).toBe('*LIST');
  req.flush(response as never);
  return req;
}

describe('OrderHistoryPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [OrderHistoryPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Rendering this page also renders `<app-header/>`, whose own
    // ngOnInit/location effect always fires a tenant-settings and a cart
    // `*GET` too — drain those incidental requests before the strict
    // `verify()` below (see home.spec.ts for the original precedent).
    httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').forEach((req) => req.flush({}));
    httpMock
      .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART')
      .forEach((req) =>
        req.flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] }),
      );
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(OrderHistoryPage);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('loads page 1 with no status filter on init', () => {
    const fixture = TestBed.createComponent(OrderHistoryPage);
    fixture.detectChanges();

    const req = flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [SUMMARY],
    });
    expect(req.request.body).toEqual({ action: '*LIST', status: '', page: 1, pageSize: 25 });
  });

  it('shows the empty state with a link to shop when there are no orders', () => {
    const fixture = TestBed.createComponent(OrderHistoryPage);
    fixture.detectChanges();
    flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("You haven't placed any orders yet");
    expect(fixture.nativeElement.querySelector('a[href^="/products/full-catalog"]')).not.toBeNull();
  });

  it('renders a row per order with status, date, items, allotment, shipping method, and tracking', () => {
    const fixture = TestBed.createComponent(OrderHistoryPage);
    fixture.detectChanges();
    flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [SUMMARY],
    });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.order-history__row');
    expect(row.textContent).toContain('EQ100001');
    expect(row.textContent).toContain('Shipped');
    expect(row.textContent).toContain('2026-09-30');
    expect(row.textContent).toContain('2 items');
    expect(row.textContent).toContain('Standard Ground');
    expect(row.textContent).toContain('Paid by allotment: $179.98');
    expect(row.textContent).toContain('1 shipment');
    expect(row.getAttribute('href')).toBe('/orders/42');

    const thumb = row.querySelector<HTMLImageElement>('.order-history__thumb')!;
    expect(thumb.src).toBe('https://cdn.example.com/black-m.jpg');
    expect(thumb.alt).toBe("Men's Trail Jacket");
    expect(row.querySelector('.order-history__thumb-more')).toBeNull();
  });

  it('shows a placeholder for a thumbnail with no image, and a "+N more" badge beyond the first 4', () => {
    const fixture = TestBed.createComponent(OrderHistoryPage);
    fixture.detectChanges();
    flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [
        {
          ...SUMMARY,
          lineCount: 6,
          thumbnails: [
            { lineNo: 1, skuId: 9001, productTitle: "Men's Trail Jacket", imageUrl: null },
            { lineNo: 2, skuId: 9044, productTitle: 'Tactical Boot', imageUrl: 'https://cdn.example.com/boot.jpg' },
          ],
        },
      ],
    });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.order-history__row');
    const thumbs = Array.from(row.querySelectorAll<HTMLImageElement>('.order-history__thumb'));
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0].src).toMatch(/^data:image\/svg\+xml,/);
    expect(thumbs[0].alt).toBe("Men's Trail Jacket");
    expect(thumbs[1].src).toBe('https://cdn.example.com/boot.jpg');

    // 6 distinct products, only 2 thumbnails sent — 4 more than shown.
    expect(row.querySelector('.order-history__thumb-more')?.textContent?.trim()).toBe('+4 more');
  });

  it('shows the unit count alongside dollars when units were also used', () => {
    const fixture = TestBed.createComponent(OrderHistoryPage);
    const page = fixture.componentInstance;

    expect(page.paidByAllotmentLabel({ ...SUMMARY, allotUnitsUsed: 2 })).toBe('Paid by allotment: $179.98 (+ 2 units)');
    expect(page.paidByAllotmentLabel({ ...SUMMARY, allotUnitsUsed: 1 })).toBe('Paid by allotment: $179.98 (+ 1 unit)');
    expect(page.paidByAllotmentLabel(SUMMARY)).toBe('Paid by allotment: $179.98');

    fixture.detectChanges();
    flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: [] });
  });

  it('reloads page 1 under the new status when a filter chip is clicked', () => {
    const fixture = TestBed.createComponent(OrderHistoryPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [SUMMARY] });
    fixture.detectChanges();

    page.setFilter('SHIPPED');

    const req = flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [SUMMARY],
    });
    expect(req.request.body).toEqual({ action: '*LIST', status: 'SHIPPED', page: 1, pageSize: 25 });
    expect(page.statusFilter()).toBe('SHIPPED');
  });

  it('does not reload when the same filter is clicked again', () => {
    const fixture = TestBed.createComponent(OrderHistoryPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [SUMMARY] });
    fixture.detectChanges();

    page.setFilter('');
    httpMock.expectNone((r) => r.url === '/cgi/APPSCDSPCH?SEPGM=APCORDER' && r.body?.action === '*LIST');
  });

  it('pages forward and backward, and clamps at the bounds', () => {
    const fixture = TestBed.createComponent(OrderHistoryPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 50, totalPages: 2 },
      data: [SUMMARY],
    });
    fixture.detectChanges();

    // Clamped — already on page 1, going to page 0 is a no-op.
    page.goToPage(0);
    httpMock.expectNone((r) => r.url === '/cgi/APPSCDSPCH?SEPGM=APCORDER' && r.body?.action === '*LIST');

    page.goToPage(2);
    const req = flushOrdersList(httpMock, {
      pagination: { page: 2, pageSize: 25, totalRows: 50, totalPages: 2 },
      data: [SUMMARY],
    });
    expect(req.request.body).toEqual({ action: '*LIST', status: '', page: 2, pageSize: 25 });

    // Clamped again — page 3 doesn't exist.
    page.goToPage(3);
    httpMock.expectNone((r) => r.url === '/cgi/APPSCDSPCH?SEPGM=APCORDER' && r.body?.action === '*LIST');
  });

  it('shows the pager only when there is more than one page', () => {
    const fixture = TestBed.createComponent(OrderHistoryPage);
    fixture.detectChanges();
    flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [SUMMARY] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.order-history__pager')).toBeNull();
  });

  it('surfaces the API message on failure', () => {
    const fixture = TestBed.createComponent(OrderHistoryPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushOrdersList(httpMock, { success: false, code: 'ERR', message: 'Not logged in.' });
    fixture.detectChanges();

    expect(page.error()).toBe('Not logged in.');
    expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain('Not logged in.');
  });
});
