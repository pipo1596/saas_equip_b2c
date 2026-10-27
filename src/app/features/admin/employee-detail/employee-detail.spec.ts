import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminEmployeeDetail } from './employee-detail';

const EMPLOYEE_DETAIL = {
  empId: 1042,
  empNum: 'E-0193',
  badgeNum: 'B5521',
  firstName: 'Dana',
  lastName: 'Smith',
  emailAddress: 'dana.smith@example.com',
  phoneNumber: '555-0142',
  roleName: 'Supervisor',
  empRank: 'SGT',
  hireDate: '2024-03-18',
  status: 'ACTIVE',
  mfaEnabled: 'Y',
  mfaMethod: 'EMAIL',
  lastLoginTs: '2026-10-20 08:14:02',
  locationCount: 2,
};

function flushTenantSettings(httpMock: HttpTestingController, dataResid = '') {
  const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS');
  req.flush({ data_resid: dataResid, logo_url: '' } as never);
}

function flushEmployeeGet(httpMock: HttpTestingController, response: object, program = 'APCTPCEMP') {
  const req = httpMock.expectOne(`/cgi/APPSCDSPCH?SEPGM=${program}`);
  expect(req.request.body.action).toBe('*GET');
  req.flush(response as never);
  return req;
}

function createPage(empId: string): ComponentFixture<AdminEmployeeDetail> {
  const fixture = TestBed.createComponent(AdminEmployeeDetail);
  fixture.componentRef.setInput('empId', empId);
  return fixture;
}

describe('AdminEmployeeDetail', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminEmployeeDetail],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Rendering this page also renders `<app-header/>`, whose own
    // ngOnInit/location effect always fires a tenant-settings and a cart
    // `*GET` too — drain those incidental requests before the strict
    // `verify()` below, even on a not-found `empId` where this page's own
    // `*GET` never fires at all.
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

  it('shows the employee returned by `*GET`', () => {
    const fixture = createPage('1042');
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    const req = flushEmployeeGet(httpMock, EMPLOYEE_DETAIL);
    expect(req.request.body.empId).toBe(1042);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Dana Smith');
    expect(fixture.nativeElement.textContent).toContain('dana.smith@example.com');
    expect(fixture.nativeElement.textContent).toContain('B5521');
  });

  it('links back to the employees list', () => {
    const fixture = createPage('1042');
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeeGet(httpMock, EMPLOYEE_DETAIL);
    fixture.detectChanges();

    const backLink: HTMLAnchorElement = fixture.nativeElement.querySelector('.employee-detail__back');
    expect(backLink.getAttribute('href')).toBe('/admin/employees');
    expect(backLink.textContent).toContain('Back to Employees');
  });

  it('uses APCTPCEMCA instead of APCTPCEMP for a Canada-residency customer', () => {
    const fixture = createPage('1042');
    fixture.detectChanges();
    flushTenantSettings(httpMock, 'CA');
    flushEmployeeGet(httpMock, EMPLOYEE_DETAIL, 'APCTPCEMCA');
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows a not-found state for a non-numeric empId, without calling the API', () => {
    const fixture = createPage('not-a-number');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("That employee couldn't be found.");
  });

  it('shows a backend failure as an error banner', () => {
    const fixture = createPage('1042');
    fixture.detectChanges();
    flushTenantSettings(httpMock);
    flushEmployeeGet(httpMock, { success: false, message: 'Session is not associated with a customer.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.alert-danger')?.textContent).toContain(
      'Session is not associated with a customer.',
    );
  });
});
