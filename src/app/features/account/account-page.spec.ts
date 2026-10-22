import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth';
import { FAKE_SESSION } from '../../core/auth/auth.testing';
import { AccountPage } from './account-page';

const PROFILE = {
  customer: { custId: 5, name: 'EDMONTON FIRE RESCUE SERVICES', logoUrl: null },
  support: { name: null, email: null, phone: null },
  personal: { firstName: 'pierre', lastName: 'achkar', email: 'pierre.achkar@3linc.com', phone: '(732) 485-4635' },
  employment: {
    roleId: 6,
    roleName: 'Admin',
    rank: null,
    hireDate: null,
    employeeNumber: '166010',
    badgeNumber: null,
    status: 'ACTIVE',
  },
  security: { mfaEnabled: 'N', mfaMethod: null, mfaDestination: null, passwordChangedTs: '2026-09-11 19:31:46' },
};

function expectEmployeeRequest(httpMock: HttpTestingController) {
  return httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE');
}

describe('AccountPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).session.set(FAKE_SESSION);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AccountPage);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows a skeleton placeholder while the account is still loading, then the real content once it resolves', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(fixture.nativeElement.textContent).not.toContain('Personal info');

    expectEmployeeRequest(httpMock).flush({
      empId: FAKE_SESSION.empId,
      firstName: FAKE_SESSION.firstName,
      lastName: FAKE_SESSION.lastName,
      locations: [],
      profile: PROFILE,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.skeleton').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Personal info');
  });

  it("renders the employee's personal info, employment details, and security settings", () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    expectEmployeeRequest(httpMock).flush({
      empId: FAKE_SESSION.empId,
      firstName: FAKE_SESSION.firstName,
      lastName: FAKE_SESSION.lastName,
      locations: [],
      profile: PROFILE,
    });
    fixture.detectChanges();

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('EDMONTON FIRE RESCUE SERVICES');
    expect(text).toContain('pierre.achkar@3linc.com');
    expect(text).toContain('(732) 485-4635');
    expect(text).toContain('Admin');
    expect(text).toContain('166010');
    expect(text).toContain('Active');
    expect(text).toContain('No');
    expect(text).not.toContain('MFA method');
  });

  it('shows the MFA method and codes-sent-to rows only when the employee record includes them', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    expectEmployeeRequest(httpMock).flush({
      empId: FAKE_SESSION.empId,
      firstName: FAKE_SESSION.firstName,
      lastName: FAKE_SESSION.lastName,
      locations: [],
      profile: {
        ...PROFILE,
        security: { ...PROFILE.security, mfaEnabled: 'Y', mfaMethod: 'Email', mfaDestination: 'j•••••@example.com' },
      },
    });
    fixture.detectChanges();

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('MFA method');
    expect(text).toContain('Email');
    expect(text).toContain('Codes sent to');
    expect(text).toContain('j•••••@example.com');
  });

  it('shows the department-managed note only when a support contact is on file', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    expectEmployeeRequest(httpMock).flush({
      empId: FAKE_SESSION.empId,
      firstName: FAKE_SESSION.firstName,
      lastName: FAKE_SESSION.lastName,
      locations: [],
      profile: PROFILE,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="note"]')).toBeNull();
  });

  it('shows the department-managed note with the support contact name when one is on file', () => {
    const fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    expectEmployeeRequest(httpMock).flush({
      empId: FAKE_SESSION.empId,
      firstName: FAKE_SESSION.firstName,
      lastName: FAKE_SESSION.lastName,
      locations: [],
      profile: { ...PROFILE, support: { name: 'Seth Bailey', email: null, phone: null } },
    });
    fixture.detectChanges();

    const note: HTMLElement = fixture.nativeElement.querySelector('[role="note"]');
    expect(note?.textContent).toContain('Seth Bailey');
  });

  it('sends a reset-password email and shows a confirmation message on success', async () => {
    const fixture = TestBed.createComponent(AccountPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    expectEmployeeRequest(httpMock).flush({
      empId: FAKE_SESSION.empId,
      firstName: FAKE_SESSION.firstName,
      lastName: FAKE_SESSION.lastName,
      locations: [],
      profile: PROFILE,
    });
    fixture.detectChanges();

    const resetPromise = page.requestPasswordReset();
    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    expect(req.request.body).toEqual({ email: PROFILE.personal.email, action: 'FORGOT1' });
    req.flush({ success: true, message: null });
    await resetPromise;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Check your email');
  });

  it('shows an error message when the reset-password request fails', async () => {
    const fixture = TestBed.createComponent(AccountPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    expectEmployeeRequest(httpMock).flush({
      empId: FAKE_SESSION.empId,
      firstName: FAKE_SESSION.firstName,
      lastName: FAKE_SESSION.lastName,
      locations: [],
      profile: PROFILE,
    });
    fixture.detectChanges();

    const resetPromise = page.requestPasswordReset();
    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN')
      .flush({ success: false, message: 'Something went wrong.' });
    await resetPromise;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Something went wrong.');
  });
});
