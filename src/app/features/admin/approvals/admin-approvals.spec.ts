import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminApprovals } from './admin-approvals';

const ROW = {
  orderId: 1001,
  orderNumber: 'EQ100001',
  status: 'PENDING_APPROVAL' as const,
  placedTs: '2026-11-02 09:14:00',
  itemCount: 4,
  lineCount: 2,
  moreCount: 0,
  subtotal: 1500,
  orderTotal: 1695,
  subtotalPoints: 0,
  allotDollarsUsed: 1695,
  allotPointsUsed: 0,
  allotUnitsUsed: 0,
  shipMethodName: 'Ground',
  thumbnails: [{ lineNo: 1, skuId: 55, productTitle: 'Duty Jacket', imageUrl: 'https://cdn.example.com/jacket.jpg' }],
  placedBy: { employeeId: 77, employeeNumber: 'A123', firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com' },
  location: { locationId: 9, code: 'ST01', name: 'Station 1' },
  approvalStep: {
    stepNo: 2,
    kind: 'LEVEL' as const,
    levelNo: 2,
    roleNames: 'Captain',
    scope: 'LOCATION' as const,
    locationId: 9,
    waitingSince: '2026-11-03 10:00:00',
    dueTs: '2026-11-06 10:00:00',
  },
  overdue: 'N' as const,
  adminCanAct: 'Y' as const,
};

function flushApprovals(httpMock: HttpTestingController, response: object) {
  const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
  expect(req.request.body.action).toBe('*ADMAPRQ');
  req.flush(response as never);
  return req;
}

describe('AdminApprovals', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminApprovals],
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
    const fixture = TestBed.createComponent(AdminApprovals);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows a skeleton placeholder while loading, then the real rows once it resolves', () => {
    const fixture = TestBed.createComponent(AdminApprovals);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelector('.admin-approvals__order-number')).toBeNull();

    flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [ROW] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.skeleton').length).toBe(0);
    expect(fixture.nativeElement.querySelector('.admin-approvals__order-number')?.textContent).toContain('EQ100001');
  });

  it('loads page 1 with empty filters on init', () => {
    const fixture = TestBed.createComponent(AdminApprovals);
    fixture.detectChanges();

    const req = flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: [] });
    expect(req.request.body).toEqual({ action: '*ADMAPRQ', locationId: 0, employeeId: 0, search: '', page: 1, pageSize: 25 });
  });

  it('shows the empty state when nothing is waiting', () => {
    const fixture = TestBed.createComponent(AdminApprovals);
    fixture.detectChanges();
    flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nothing waiting for approval.');
  });

  it('shows the API message on a load failure', () => {
    const fixture = TestBed.createComponent(AdminApprovals);
    fixture.detectChanges();
    flushApprovals(httpMock, { success: false, code: 'ERR', message: 'Only an administrator can open the approvals screen.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
      'Only an administrator can open the approvals screen.',
    );
  });

  it('renders a row with employee, items, total, step, and decide-by date', () => {
    const fixture = TestBed.createComponent(AdminApprovals);
    fixture.detectChanges();
    flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [ROW] });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.admin-approvals__row');
    expect(row.querySelector('.admin-approvals__order-number')?.textContent).toContain('EQ100001');
    expect(row.querySelector('.admin-approvals__employee-name')?.textContent).toContain('Sam Lee');
    expect(row.querySelector('.admin-approvals__employee-number')?.textContent).toContain('A123');
    expect(row.querySelector('.admin-approvals__step')?.textContent).toContain('Captain (level 2)');
    expect(row.querySelector('.admin-approvals__due')?.textContent).toContain('2026-11-06');
  });

  it('labels an OVERRIDE (or pre-multi-level, kind null) step as waiting on an administrator', () => {
    const fixture = TestBed.createComponent(AdminApprovals);
    fixture.detectChanges();
    flushApprovals(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [{ ...ROW, approvalStep: { ...ROW.approvalStep, kind: null, levelNo: null, roleNames: null } }],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.admin-approvals__step')?.textContent).toContain(
      'Waiting on an administrator',
    );
  });

  it('highlights an overdue row and labels its date "Overdue since" instead of "Decide by"', () => {
    const fixture = TestBed.createComponent(AdminApprovals);
    fixture.detectChanges();
    flushApprovals(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [{ ...ROW, overdue: 'Y' as const }],
    });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.admin-approvals__row');
    expect(row.classList).toContain('admin-approvals__row--overdue');
    expect(row.querySelector('.admin-approvals__due')?.textContent).toContain('Overdue since');
  });

  it('shows a "Your order" tag instead of Approve/Reject when adminCanAct is N, but still a View order link', () => {
    const fixture = TestBed.createComponent(AdminApprovals);
    fixture.detectChanges();
    flushApprovals(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [{ ...ROW, adminCanAct: 'N' as const }],
    });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.admin-approvals__row');
    expect(row.querySelector('.admin-approvals__your-order')?.textContent).toContain('Your order');
    expect(row.querySelector('.admin-approvals__actions .btn-success')).toBeNull();
    expect(row.querySelector('.admin-approvals__actions .btn-danger')).toBeNull();
    expect(row.querySelector('a[href="/admin/orders/1001?from=approvals"]')?.textContent).toContain('View order');
  });

  it('always links to the order detail page, even when the viewer can act on the row', () => {
    const fixture = TestBed.createComponent(AdminApprovals);
    fixture.detectChanges();
    flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [ROW] });
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelector('.admin-approvals__row');
    expect(row.querySelector('a[href="/admin/orders/1001?from=approvals"]')?.textContent).toContain('View order');
  });

  it('debounces search and resets to page 1', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AdminApprovals);
    fixture.detectChanges();
    flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: [] });

    fixture.componentInstance.searchControl.setValue('Lee');
    vi.advanceTimersByTime(300);

    const req = flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 0 }, data: [] });
    expect(req.request.body).toEqual({ action: '*ADMAPRQ', locationId: 0, employeeId: 0, search: 'Lee', page: 1, pageSize: 25 });
    vi.useRealTimers();
  });

  it('pages forward and back', () => {
    const fixture = TestBed.createComponent(AdminApprovals);
    fixture.detectChanges();
    flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 30, totalPages: 2 }, data: [ROW] });
    fixture.detectChanges();

    const nextBtn: HTMLButtonElement = fixture.nativeElement.querySelectorAll('.admin-approvals__pager button')[1];
    nextBtn.click();
    fixture.detectChanges();

    const req = flushApprovals(httpMock, { pagination: { page: 2, pageSize: 25, totalRows: 30, totalPages: 2 }, data: [ROW] });
    expect(req.request.body).toEqual({ action: '*ADMAPRQ', locationId: 0, employeeId: 0, search: '', page: 2, pageSize: 25 });
  });

  describe('Approve/Reject', () => {
    function loadOneRow(fixture: ComponentFixture<AdminApprovals>) {
      fixture.detectChanges();
      flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [ROW] });
      fixture.detectChanges();
    }

    it('disables the Approve submit button until a note is entered, then posts *ADMAPPR and drops the row', () => {
      const fixture = TestBed.createComponent(AdminApprovals);
      loadOneRow(fixture);

      fixture.nativeElement.querySelector('.admin-approvals__actions .btn-success').click();
      fixture.detectChanges();
      const submit: HTMLButtonElement = fixture.nativeElement.querySelector('.admin-approvals__action-dialog .btn-success');
      expect(submit.disabled).toBe(true);

      fixture.componentInstance.actionNotes.setValue('Approved -- replacement gear after the Elm St fire.');
      fixture.detectChanges();
      expect(submit.disabled).toBe(false);

      submit.click();
      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({
        action: '*ADMAPPR',
        orderId: 1001,
        notes: 'Approved -- replacement gear after the Elm St fire.',
      });
      req.flush({ success: true, message: 'Order EQ100001 approved.', orderId: 1001, orderNumber: 'EQ100001', status: 'PROCESSING' });
      fixture.detectChanges();

      expect(fixture.componentInstance.actionRow()).toBeNull();
      expect(fixture.nativeElement.querySelector('.alert-success')?.textContent).toContain('Order EQ100001 approved.');
      expect(fixture.nativeElement.querySelector('.admin-approvals__order-number')).toBeNull();
    });

    it('disables the Reject submit button until a note is entered, then posts *ADMREJ', () => {
      const fixture = TestBed.createComponent(AdminApprovals);
      loadOneRow(fixture);

      fixture.nativeElement.querySelector('.admin-approvals__actions .btn-danger').click();
      fixture.detectChanges();
      const submit: HTMLButtonElement = fixture.nativeElement.querySelector('.admin-approvals__action-dialog .btn-danger');
      expect(submit.disabled).toBe(true);

      fixture.componentInstance.actionNotes.setValue('Duplicate of EQ099876.');
      fixture.detectChanges();
      expect(submit.disabled).toBe(false);

      submit.click();
      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({ action: '*ADMREJ', orderId: 1001, notes: 'Duplicate of EQ099876.' });
      req.flush({ success: true, message: 'Order EQ100001 rejected.', orderId: 1001, orderNumber: 'EQ100001', status: 'REJECTED' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.alert-success')?.textContent).toContain('Order EQ100001 rejected.');
    });

    it('shows the API failure message and reloads the queue instead of dropping the row', () => {
      const fixture = TestBed.createComponent(AdminApprovals);
      loadOneRow(fixture);

      fixture.nativeElement.querySelector('.admin-approvals__actions .btn-success').click();
      fixture.detectChanges();
      fixture.componentInstance.actionNotes.setValue('Approved.');
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.admin-approvals__action-dialog .btn-success').click();

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER')
        .flush({ success: false, code: 'ERR', message: 'Order EQ100001 is no longer pending approval.' });
      fixture.detectChanges();

      expect(fixture.componentInstance.actionRow()).toBeNull();
      expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
        'Order EQ100001 is no longer pending approval.',
      );

      // The error path reloads the queue — flush that follow-up request too.
      flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [ROW] });
    });

    it('shows a generic message and reloads the queue on a network failure', () => {
      const fixture = TestBed.createComponent(AdminApprovals);
      loadOneRow(fixture);

      fixture.nativeElement.querySelector('.admin-approvals__actions .btn-danger').click();
      fixture.detectChanges();
      fixture.componentInstance.actionNotes.setValue('Reason');
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.admin-approvals__action-dialog .btn-danger').click();

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER').flush('failure', { status: 0, statusText: 'Unknown Error' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
        'We could not reach the server. Please try again.',
      );
      flushApprovals(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, data: [ROW] });
    });

    it('closes the dialog on Cancel without submitting', () => {
      const fixture = TestBed.createComponent(AdminApprovals);
      loadOneRow(fixture);

      fixture.nativeElement.querySelector('.admin-approvals__actions .btn-success').click();
      fixture.detectChanges();
      expect(fixture.componentInstance.actionRow()).not.toBeNull();

      fixture.nativeElement.querySelector('.admin-approvals__action-dialog .btn-outline-secondary').click();
      fixture.detectChanges();

      expect(fixture.componentInstance.actionRow()).toBeNull();
      httpMock.expectNone('/cgi/APPSCDSPCH?SEPGM=APCORDER');
    });
  });
});
