import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { ApprovalQueue } from './approval-queue';

const ROW = {
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
  thumbnails: [{ lineNo: 1, skuId: 501, productTitle: 'Duty jacket', imageUrl: 'https://cdn.example.com/jacket.jpg' }],
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

function flushApprovals(httpMock: HttpTestingController, response: object) {
  const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
  expect(req.request.body.action).toBe('*APPRQ');
  req.flush(response as never);
  return req;
}

describe('ApprovalQueue', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ApprovalQueue],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
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
    const fixture = TestBed.createComponent(ApprovalQueue);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('loads page 1 on init', () => {
    const fixture = TestBed.createComponent(ApprovalQueue);
    fixture.detectChanges();

    const req = flushApprovals(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [ROW],
    });
    expect(req.request.body).toEqual({ action: '*APPRQ', page: 1, pageSize: 25 });
  });

  it('shows the empty state when nothing is waiting', () => {
    const fixture = TestBed.createComponent(ApprovalQueue);
    fixture.detectChanges();
    flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nothing waiting for your approval.');
  });

  it('shows the API message on a load failure', () => {
    const fixture = TestBed.createComponent(ApprovalQueue);
    fixture.detectChanges();
    flushApprovals(httpMock, { success: false, code: 'ERR', message: 'Not logged in.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain('Not logged in.');
  });

  it('renders a row with employee, items, total, step, and respond-by date', () => {
    const fixture = TestBed.createComponent(ApprovalQueue);
    fixture.detectChanges();
    flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [ROW] });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.approval-queue__row');
    expect(row.querySelector('.approval-queue__order-number')?.textContent).toContain('SO-104901');
    expect(row.querySelector('.approval-queue__employee-name')?.textContent).toContain('Alex Morgan');
    expect(row.querySelector('.approval-queue__employee-number')?.textContent).toContain('E1042');
    expect(row.querySelector('.approval-queue__step')?.textContent).toContain('Level 1');
    expect(row.querySelector('.approval-queue__due')?.textContent).toContain('2026-10-06');
    expect(row.getAttribute('href')).toBe('/orders/86');
  });

  it('labels an OVERRIDE step as Administrator, with a blank respond-by date', () => {
    const fixture = TestBed.createComponent(ApprovalQueue);
    fixture.detectChanges();
    flushApprovals(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [{ ...ROW, approvalStep: { ...ROW.approvalStep, kind: 'OVERRIDE', levelNo: null, dueTs: null } }],
    });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.approval-queue__row');
    expect(row.querySelector('.approval-queue__step')?.textContent).toContain('Administrator');
    expect(row.querySelector('.approval-queue__due')?.textContent?.trim()).toBe('');
  });

  it('shows the +N overflow badge from the server\'s own moreCount', () => {
    const fixture = TestBed.createComponent(ApprovalQueue);
    fixture.detectChanges();
    flushApprovals(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [{ ...ROW, moreCount: 2 }],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.approval-queue__items-count')?.textContent).toContain('+2');
  });

  it('highlights a row due today, but not one due later', () => {
    // Local-date formatting (not `toISOString()`, which is UTC and can land
    // on the wrong calendar day depending on the runner's timezone/time).
    const asDateString = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const today = asDateString(now);
    const farFuture = asDateString(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()));

    const fixture = TestBed.createComponent(ApprovalQueue);
    fixture.detectChanges();
    flushApprovals(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 2, totalPages: 1 },
      data: [
        { ...ROW, orderId: 1, approvalStep: { ...ROW.approvalStep, dueTs: `${today} 09:00:00` } },
        { ...ROW, orderId: 2, approvalStep: { ...ROW.approvalStep, dueTs: `${farFuture} 09:00:00` } },
      ],
    });
    fixture.detectChanges();

    const rows: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.approval-queue__row'));
    expect(rows[0].classList).toContain('approval-queue__row--due-soon');
    expect(rows[1].classList).not.toContain('approval-queue__row--due-soon');
  });

  it('pages forward and back', () => {
    const fixture = TestBed.createComponent(ApprovalQueue);
    fixture.detectChanges();
    flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 30, totalPages: 2 }, data: [ROW] });
    fixture.detectChanges();

    const nextBtn: HTMLButtonElement = fixture.nativeElement.querySelectorAll('.approval-queue__pager button')[1];
    nextBtn.click();
    fixture.detectChanges();

    const req = flushApprovals(httpMock, {
      pagination: { page: 2, pageSize: 25, totalRows: 30, totalPages: 2 },
      data: [ROW],
    });
    expect(req.request.body).toEqual({ action: '*APPRQ', page: 2, pageSize: 25 });
  });
});
