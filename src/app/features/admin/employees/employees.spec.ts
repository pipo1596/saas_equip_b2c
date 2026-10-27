import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AdminEmployees } from './employees';

const EMPLOYEE_ROW = {
  empId: 1042,
  custId: 7,
  empNum: 'E-0193',
  internalId: 'HR-88',
  badgeNum: 'B5521',
  firstName: 'Dana',
  lastName: 'Smith',
  emailAddress: 'dana.smith@example.com',
  phoneNumber: '555-0142',
  roleId: 12,
  roleName: 'Supervisor',
  empRank: 'SGT',
  hireDate: '2024-03-18',
  status: 'ACTIVE',
  mfaEnabled: 'Y',
  mfaMethod: 'EMAIL',
  lastLoginTs: '2026-10-20 08:14:02',
  locations: [{ locationId: 3, locationName: 'North Station' }],
};

function flushTenantSettings(httpMock: HttpTestingController, dataResid = '') {
  const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS');
  req.flush({ data_resid: dataResid, logo_url: '' } as never);
}

function flushEmployeesList(httpMock: HttpTestingController, response: object, program = 'APCTPCEMP') {
  const req = httpMock.expectOne(`/cgi/APPSCDSPCH?SEPGM=${program}`);
  expect(req.request.body.action).toBe('*LIST');
  req.flush(response as never);
  return req;
}

function flushRoles(httpMock: HttpTestingController, response: object) {
  httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCROLE').forEach((req) => {
    expect(req.request.body.action).toBe('*LIST_ALL');
    req.flush(response as never);
  });
}

describe('AdminEmployees', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminEmployees],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Rendering this page also renders `<app-header/>`, whose own
    // ngOnInit/location effect always fires a cart `*GET` too — drain it
    // (and anything left over) before the strict `verify()` below.
    httpMock
      .match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART')
      .forEach((req) =>
        req.flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] }),
      );
    httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCROLE').forEach((req) => req.flush({ data: [] }));
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AdminEmployees);
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeesList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows the admin nav with "Employees" marked as the current page', () => {
    const fixture = TestBed.createComponent(AdminEmployees);
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeesList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector(
      'app-admin-nav a[href="/admin/employees"]',
    );
    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('uses APCTPCEMCA instead of APCTPCEMP for a Canada-residency customer', () => {
    const fixture = TestBed.createComponent(AdminEmployees);
    fixture.detectChanges();
    flushTenantSettings(httpMock, 'CA');
    flushEmployeesList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] }, 'APCTPCEMCA');
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('lists employees from the API response', () => {
    const fixture = TestBed.createComponent(AdminEmployees);
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeesList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [EMPLOYEE_ROW],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Dana Smith');
    expect(fixture.nativeElement.textContent).toContain('North Station');
  });

  it('sends the trimmed, debounced search box value as `search`', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AdminEmployees);
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeesList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });

    fixture.componentInstance.searchControl.setValue('  smith  ');
    vi.advanceTimersByTime(300);
    const req = flushEmployeesList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 },
      data: [],
    });
    expect(req.request.body.search).toBe('smith');
    vi.useRealTimers();
  });

  it('treats the "No records matched" failure as an empty result, not an error', () => {
    const fixture = TestBed.createComponent(AdminEmployees);
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeesList(httpMock, { success: false, message: 'No records matched the search criteria.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.alert-danger')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No employees match your search.');
  });

  it('shows a real backend failure as an error banner', () => {
    const fixture = TestBed.createComponent(AdminEmployees);
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeesList(httpMock, { success: false, message: 'Session is not associated with a customer.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
      'Session is not associated with a customer.',
    );
  });

  it('sends roleId only once a specific role is picked, and omits it for "All roles"', () => {
    const fixture = TestBed.createComponent(AdminEmployees);
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeesList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    flushRoles(httpMock, { data: [{ roleId: 12, roleName: 'Supervisor', isActive: 'Y', description: null }] });
    fixture.detectChanges();

    // Only an option that actually exists in the (now role-populated)
    // dropdown can be selected on a native `<select>`.
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('#employee-role');
    select.value = '12';
    select.dispatchEvent(new Event('change'));
    const req = flushEmployeesList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 },
      data: [],
    });
    expect(req.request.body.roleId).toBe(12);
  });

  it('paginates results', () => {
    const fixture = TestBed.createComponent(AdminEmployees);
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeesList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 50, totalPages: 2 },
      data: [EMPLOYEE_ROW],
    });
    fixture.detectChanges();

    const nextButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.admin-employees__pager button:last-of-type',
    );
    nextButton.click();
    const req = flushEmployeesList(httpMock, {
      pagination: { page: 2, pageSize: 25, totalRows: 50, totalPages: 2 },
      data: [EMPLOYEE_ROW],
    });
    expect(req.request.body.page).toBe(2);
    fixture.detectChanges();

    const pagerLabel: HTMLElement = fixture.nativeElement.querySelector('.admin-employees__pager-label');
    expect(pagerLabel.textContent).toContain('Page 2 of 2');
  });

  it('links each row\'s View action to the employee detail route', () => {
    const fixture = TestBed.createComponent(AdminEmployees);
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeesList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 },
      data: [EMPLOYEE_ROW],
    });
    fixture.detectChanges();

    const viewLink: HTMLAnchorElement = fixture.nativeElement.querySelector('.admin-employees__view');
    expect(viewLink.getAttribute('href')).toBe('/admin/employees/1042');
  });

  it('shows "Clear filters" only once a filter is set, and resets everything when clicked', () => {
    const fixture = TestBed.createComponent(AdminEmployees);
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeesList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.admin-employees__filter-actions')).toBeNull();

    fixture.componentInstance.searchControl.setValue('smith', { emitEvent: false });
    fixture.componentInstance.onRoleChange('12');
    flushEmployeesList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    fixture.detectChanges();

    const clearButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.admin-employees__filter-actions button',
    );
    expect(clearButton).not.toBeNull();

    clearButton.click();
    const req = flushEmployeesList(httpMock, {
      pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 },
      data: [],
    });
    expect(req.request.body.search).toBe('');
    expect(req.request.body.roleId).toBeUndefined();
    fixture.detectChanges();

    expect(fixture.componentInstance.searchControl.value).toBe('');
    expect(fixture.nativeElement.querySelector('.admin-employees__filter-actions')).toBeNull();
  });

  it('populates the role dropdown from the roles API, including inactive roles', () => {
    const fixture = TestBed.createComponent(AdminEmployees);
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeesList(httpMock, { pagination: { page: 1, pageSize: 25, totalRows: 0, totalPages: 1 }, data: [] });
    flushRoles(httpMock, {
      data: [
        { roleId: 12, roleName: 'Supervisor', isActive: 'Y', description: 'Shift supervisors' },
        { roleId: 9, roleName: 'Officer', isActive: 'N', description: null },
      ],
    });
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelectorAll('#employee-role option');
    const labels = Array.from(options as NodeListOf<HTMLOptionElement>).map((option) => option.textContent?.trim());
    expect(labels).toEqual(['All roles', 'Supervisor', 'Officer']);
  });
});
