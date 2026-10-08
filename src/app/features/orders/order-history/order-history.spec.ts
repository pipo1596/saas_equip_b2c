import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { CartService } from '../../../core/cart/cart';
import { POINTS_ONLY_ALLOTMENT } from '../../../core/cart/cart.testing';
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
  subtotalPoints: null,
  allotDollarsUsed: 179.98,
  allotUnitsUsed: 0,
  allotPointsUsed: 0,
  shipMethodName: 'Standard Ground',
  trackingCount: 1,
};

const EMPTY_STATUS_COUNTS = {
  ALL: 0,
  PENDING_APPROVAL: 0,
  PROCESSING: 0,
  PARTIALLY_SHIPPED: 0,
  SHIPPED: 0,
  CANCELLED: 0,
  REJECTED: 0,
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
    expect(row.querySelector('.order-history__items-count')?.textContent?.trim()).toBe('2 items');
  });

  it("should hide the order total, and the 'paid by allotment' dollar figure, when the employee's allotment is points-only", () => {
    TestBed.inject(CartService).cart.update((cart) => ({ ...cart, allotment: POINTS_ONLY_ALLOTMENT }));

    const fixture = TestBed.createComponent(OrderHistoryPage);
    fixture.detectChanges();
    flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [{ ...SUMMARY, subtotalPoints: null, allotDollarsUsed: 0, allotUnitsUsed: 2, allotPointsUsed: 0 }],
    });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.order-history__row');
    // Still rendered (keeps the grid column aligned with the header row)
    // but empty — no points-total field for this order, so nothing to show.
    expect(row.querySelector('.order-history__row-total')?.textContent?.trim()).toBe('');
    expect(row.textContent).not.toContain('$');
    expect(row.textContent).toContain('Paid by allotment: 2 units');
  });

  it('shows the order subtotal in points, and points used by allotment, when the allotment is points-only', () => {
    TestBed.inject(CartService).cart.update((cart) => ({ ...cart, allotment: POINTS_ONLY_ALLOTMENT }));

    const fixture = TestBed.createComponent(OrderHistoryPage);
    fixture.detectChanges();
    flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [{ ...SUMMARY, subtotalPoints: 18, allotDollarsUsed: 0, allotUnitsUsed: 0, allotPointsUsed: 18 }],
    });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.order-history__row');
    expect(row.querySelector('.order-history__row-total')?.textContent?.trim()).toBe('18 pts');
    expect(row.textContent).toContain('Paid by allotment: 18 pts');
  });

  it('shows at most 3 thumbnails, with a "+N" count beyond that', () => {
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
            { lineNo: 3, skuId: 9045, productTitle: 'Duty Belt', imageUrl: 'https://cdn.example.com/belt.jpg' },
            { lineNo: 4, skuId: 9046, productTitle: 'Cap', imageUrl: 'https://cdn.example.com/cap.jpg' },
          ],
        },
      ],
    });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.order-history__row');
    const thumbs = Array.from(row.querySelectorAll<HTMLImageElement>('.order-history__thumb'));
    // Only the first 3 render, even though the API sent 4.
    expect(thumbs).toHaveLength(3);
    expect(thumbs[0].src).toMatch(/^data:image\/svg\+xml,/);
    expect(thumbs[0].alt).toBe("Men's Trail Jacket");
    expect(thumbs[1].src).toBe('https://cdn.example.com/boot.jpg');
    expect(thumbs[2].src).toBe('https://cdn.example.com/belt.jpg');

    // 6 distinct products, only 3 shown — 3 more than shown.
    const itemsCount: HTMLElement = row.querySelector('.order-history__items-count')!;
    expect(itemsCount.querySelector('b')?.textContent?.trim()).toBe('+3');
    expect(itemsCount.textContent).toContain('2 items');
  });

  it('shows no "+N" count when every distinct product already has a thumbnail', () => {
    const fixture = TestBed.createComponent(OrderHistoryPage);
    fixture.detectChanges();
    flushOrdersList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [SUMMARY],
    });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.order-history__row');
    expect(row.querySelector('.order-history__items-count b')).toBeNull();
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

  describe('order number / date / sort filters', () => {
    it('debounces the order number search and resets to page 1', () => {
      vi.useFakeTimers();
      try {
        const fixture = TestBed.createComponent(OrderHistoryPage);
        const page = fixture.componentInstance;
        fixture.detectChanges();
        flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [SUMMARY] });
        fixture.detectChanges();

        page.orderNumberControl.setValue('1003');
        httpMock.expectNone((r) => r.url === '/cgi/APPSCDSPCH?SEPGM=APCORDER' && r.body?.action === '*LIST');

        vi.advanceTimersByTime(350);
        const req = flushOrdersList(httpMock, {
          pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
          data: [SUMMARY],
        });
        expect(req.request.body).toEqual({ action: '*LIST', status: '', orderNumber: '1003', page: 1, pageSize: 25 });
      } finally {
        vi.useRealTimers();
      }
    });

    it('sends datePreset and fills the date inputs from the resolved range once it clicks', () => {
      const fixture = TestBed.createComponent(OrderHistoryPage);
      const page = fixture.componentInstance;
      fixture.detectChanges();
      flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [SUMMARY] });
      fixture.detectChanges();

      page.setDatePreset('LAST30');
      const req = flushOrdersList(httpMock, {
        pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
        data: [SUMMARY],
        filters: {
          status: '',
          orderNumber: '',
          dateFrom: '2026-09-09',
          dateTo: '2026-10-08',
          datePreset: 'LAST30',
          sort: 'NEWEST',
        },
      });
      expect(req.request.body).toEqual({ action: '*LIST', status: '', datePreset: 'LAST30', page: 1, pageSize: 25 });

      expect(page.dateFrom()).toBe('2026-09-09');
      expect(page.dateTo()).toBe('2026-10-08');
      expect(page.activeDatePreset()).toBe('LAST30');
    });

    it('clears the active preset once a custom date is typed, and sends it as dateFrom/dateTo', () => {
      const fixture = TestBed.createComponent(OrderHistoryPage);
      const page = fixture.componentInstance;
      fixture.detectChanges();
      flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [SUMMARY] });
      fixture.detectChanges();

      page.setDatePreset('LAST90');
      flushOrdersList(httpMock, {
        pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
        data: [SUMMARY],
        filters: {
          status: '',
          orderNumber: '',
          dateFrom: '2026-07-10',
          dateTo: '2026-10-08',
          datePreset: 'LAST90',
          sort: 'NEWEST',
        },
      });
      expect(page.activeDatePreset()).toBe('LAST90');

      page.onDateFromChange('2026-01-01');
      expect(page.activeDatePreset()).toBeNull();

      const req = flushOrdersList(httpMock, {
        pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
        data: [SUMMARY],
      });
      expect(req.request.body).toEqual({
        action: '*LIST',
        status: '',
        dateFrom: '2026-01-01',
        dateTo: '2026-10-08',
        page: 1,
        pageSize: 25,
      });
    });

    it('defaults to "All time" active before anything is touched', () => {
      const fixture = TestBed.createComponent(OrderHistoryPage);
      const page = fixture.componentInstance;
      fixture.detectChanges();
      flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: [] });

      expect(page.activeDatePreset()).toBe('ALL');
    });

    it('reloads with the chosen sort', () => {
      const fixture = TestBed.createComponent(OrderHistoryPage);
      const page = fixture.componentInstance;
      fixture.detectChanges();
      flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [SUMMARY] });
      fixture.detectChanges();

      page.setSort('OLDEST');
      const req = flushOrdersList(httpMock, {
        pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
        data: [SUMMARY],
      });
      expect(req.request.body).toEqual({ action: '*LIST', status: '', sort: 'OLDEST', page: 1, pageSize: 25 });
    });
  });

  describe('status chip counts', () => {
    it("shows each chip's count from the response, including a real 0", () => {
      const fixture = TestBed.createComponent(OrderHistoryPage);
      fixture.detectChanges();
      flushOrdersList(httpMock, {
        pagination: { page: 1, pageSize: 25, totalRows: 11, totalPages: 1 },
        data: [SUMMARY],
        statusCounts: {
          ALL: 11,
          PENDING_APPROVAL: 1,
          PROCESSING: 6,
          PARTIALLY_SHIPPED: 1,
          SHIPPED: 1,
          CANCELLED: 1,
          REJECTED: 0,
        },
      });
      fixture.detectChanges();

      const chips: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.order-history__chip'));
      const countFor = (label: string) =>
        chips.find((chip) => chip.textContent?.trim().startsWith(label))?.querySelector('.order-history__chip-count')
          ?.textContent;

      expect(countFor('All')).toBe('11');
      expect(countFor('Processing')).toBe('6');
      expect(countFor('Rejected')).toBe('0');
    });

    it('shows no count badge before the first response arrives', () => {
      const fixture = TestBed.createComponent(OrderHistoryPage);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.order-history__chip-count')).toBeNull();

      flushOrdersList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: [] });
    });
  });
});
