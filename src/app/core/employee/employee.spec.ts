import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { EmployeeDetails, EmployeeService } from './employee';

const EMP_ID = 'E1';
const SESSION_ID = 'S1';

const PROFILE = {
  customer: { custId: 5, name: 'EDMONTON FIRE RESCUE SERVICES', logoUrl: '/photos/partner-2/customers/logo.jpg' },
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
  security: { mfaEnabled: 'N' as const, mfaMethod: null, mfaDestination: null, passwordChangedTs: '2026-09-11 19:31:46' },
};

describe('EmployeeService', () => {
  let service: EmployeeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EmployeeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts *GET with empId/sessionId and updates the employee signal', () => {
    let result: EmployeeDetails | undefined;
    service.load(EMP_ID, SESSION_ID).subscribe((employee) => (result = employee));

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE');
    expect(req.request.body).toEqual({ empId: EMP_ID, sessionId: SESSION_ID, action: '*GET' });
    req.flush({
      empId: EMP_ID,
      firstName: 'pierre',
      lastName: 'achkar',
      locations: [],
      profile: PROFILE,
    });

    expect(result?.profile).toEqual(PROFILE);
    expect(service.employee()?.profile).toEqual(PROFILE);
  });

  it('normalizes a missing impersonation to null', () => {
    let result: EmployeeDetails | undefined;
    service.load(EMP_ID, SESSION_ID).subscribe((employee) => (result = employee));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE').flush({
      empId: EMP_ID,
      firstName: 'pierre',
      lastName: 'achkar',
      locations: [],
    });

    expect(result?.impersonation).toBeNull();
  });

  it('normalizes a missing profile block to null, rather than throwing', () => {
    let result: EmployeeDetails | undefined;
    service.load(EMP_ID, SESSION_ID).subscribe((employee) => (result = employee));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE').flush({
      empId: EMP_ID,
      firstName: 'pierre',
      lastName: 'achkar',
      locations: [],
    });

    expect(result?.profile).toBeNull();
  });

  it('caches the result and reuses it on a later call instead of firing a second request', () => {
    service.load(EMP_ID, SESSION_ID).subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE').flush({
      empId: EMP_ID,
      firstName: 'pierre',
      lastName: 'achkar',
      locations: [],
      profile: PROFILE,
    });

    let second: EmployeeDetails | undefined;
    service.load(EMP_ID, SESSION_ID).subscribe((employee) => (second = employee));

    httpMock.expectNone('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE');
    expect(second?.profile).toEqual(PROFILE);
  });

  it('shares one in-flight request across concurrent calls', () => {
    let first: EmployeeDetails | undefined;
    let second: EmployeeDetails | undefined;
    service.load(EMP_ID, SESSION_ID).subscribe((employee) => (first = employee));
    service.load(EMP_ID, SESSION_ID).subscribe((employee) => (second = employee));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE').flush({
      empId: EMP_ID,
      firstName: 'pierre',
      lastName: 'achkar',
      locations: [],
      profile: PROFILE,
    });

    expect(first?.profile).toEqual(PROFILE);
    expect(second?.profile).toEqual(PROFILE);
  });

  describe('clear', () => {
    it('resets the employee signal and allows a fresh fetch afterward', () => {
      service.load(EMP_ID, SESSION_ID).subscribe();
      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE').flush({
        empId: EMP_ID,
        firstName: 'pierre',
        lastName: 'achkar',
        locations: [],
        profile: PROFILE,
      });

      service.clear();
      expect(service.employee()).toBeNull();

      service.load(EMP_ID, SESSION_ID).subscribe();
      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE').flush({
        empId: EMP_ID,
        firstName: 'pierre',
        lastName: 'achkar',
        locations: [],
        profile: PROFILE,
      });
      expect(service.employee()?.profile).toEqual(PROFILE);
    });
  });
});
