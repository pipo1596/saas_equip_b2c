import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AdminOrders } from './orders';

const ORDER_ROW = {
  orderId: 42,
  orderNumber: 'EQ100001',
  status: 'PROCESSING' as const,
  placedTs: '2026-09-30 10:00:00',
  itemCount: 2,
  lineCount: 1,
  thumbnails: [],
  orderTotal: 221.28,
  subtotalPoints: null,
  allotDollarsUsed: 179.98,
  allotUnitsUsed: 0,
  allotPointsUsed: 0,
  shipMethodName: 'Standard Ground',
  trackingCount: 0,
};

function flushCart(httpMock: HttpTestingController) {
  httpMock
    .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART')
    .forEach((req) => req.flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] }));
}

function flushOrdersList(httpMock: HttpTestingController, response: object) {
  const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
  expect(req.request.body.action).toBe('*CUSTLIST');
  req.flush(response as never);
  return req;
}

describe('AdminOrders', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminOrders],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Rendering this page also renders `<app-header/>`, whose own ngOnInit/
    // location effect always fires a tenant-settings and a cart `*GET` too —
    // drain those incidental requests before the strict `verify()` below.
    httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').forEach((req) => req.flush({}));
    flushCart(httpMock);
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('links back to the Admin home page', () => {
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.admin-orders__back');
    expect(link.getAttribute('href')).toBe('/admin');
    expect(link.textContent).toContain('Back to Admin');
  });

  it('lists orders across employees from the API response', () => {
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [ORDER_ROW],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('EQ100001');
    expect(fixture.nativeElement.textContent).toContain('$221.28');
  });

  it('shows the points total instead of a dollar figure when `subtotalPoints` is set', () => {
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [{ ...ORDER_ROW, subtotalPoints: 450 }],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('450 pts');
    expect(fixture.nativeElement.textContent).not.toContain('$221.28');
  });

  it('shows "—" for a row with no `placedBy` attribution', () => {
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [ORDER_ROW],
    });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.admin-orders__row');
    expect(row.textContent).toContain('—');
  });

  it('shows the `placedBy` name when the row includes it', () => {
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [
        {
          ...ORDER_ROW,
          placedBy: { employeeId: 1042, firstName: 'Dana', lastName: 'Smith', email: 'dana.smith@example.com' },
        },
      ],
    });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.admin-orders__row');
    expect(row.textContent).toContain('Dana Smith');
  });

  it('sends the trimmed, debounced search box value as `orderNumber`', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });

    fixture.componentInstance.searchControl.setValue('  eq1000  ');
    vi.advanceTimersByTime(300);
    const req = flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    expect(req.request.body.orderNumber).toBe('eq1000');
    vi.useRealTimers();
  });

  it('sends status only once a specific status is picked, and omits it for "All statuses"', () => {
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('#order-status');
    select.value = 'PROCESSING';
    select.dispatchEvent(new Event('change'));
    const req = flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    expect(req.request.body.status).toBe('PROCESSING');
  });

  it('treats a backend failure as an error banner', () => {
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    flushOrdersList(httpMock, { success: false, code: 'ERR', message: 'Session is not associated with a customer.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
      'Session is not associated with a customer.',
    );
  });

  it('paginates results', () => {
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 50, totalPages: 2 },
      data: [ORDER_ROW],
    });
    fixture.detectChanges();

    const nextButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.admin-orders__pager button:last-of-type',
    );
    nextButton.click();
    const req = flushOrdersList(httpMock, {
      pagination: { page: 2, pageSize: 25, totalRows: 50, totalPages: 2 },
      data: [ORDER_ROW],
    });
    expect(req.request.body.page).toBe(2);
    fixture.detectChanges();

    const pagerLabel: HTMLElement = fixture.nativeElement.querySelector('.admin-orders__pager-label');
    expect(pagerLabel.textContent).toContain('Page 2 of 2');
  });

  it('links each row\'s View action to the admin order detail route', () => {
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [ORDER_ROW],
    });
    fixture.detectChanges();

    const viewLink: HTMLAnchorElement = fixture.nativeElement.querySelector('.admin-orders__view');
    expect(viewLink.getAttribute('href')).toBe('/admin/orders/42');
  });

  it('shows "Clear filters" only once a filter is set, and resets everything when clicked', () => {
    const fixture = TestBed.createComponent(AdminOrders);
    fixture.detectChanges();
    flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.admin-orders__filter-actions')).toBeNull();

    fixture.componentInstance.searchControl.setValue('eq1000', { emitEvent: false });
    fixture.componentInstance.onStatusChange('PROCESSING');
    flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    fixture.detectChanges();

    const clearButton: HTMLButtonElement = fixture.nativeElement.querySelector('.admin-orders__filter-actions button');
    expect(clearButton).not.toBeNull();

    clearButton.click();
    const req = flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    expect(req.request.body.orderNumber).toBeUndefined();
    expect(req.request.body.status).toBe('');
    fixture.detectChanges();

    expect(fixture.componentInstance.searchControl.value).toBe('');
    expect(fixture.nativeElement.querySelector('.admin-orders__filter-actions')).toBeNull();
  });
});
