import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService, LoginResponse } from './auth';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts out unauthenticated with no MFA pending', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.mfaPending()).toBe(false);
  });

  it('sets the session on a successful login with no MFA step', () => {
    service.login('pierre.achkar@3linc.com', 'Setup123!').subscribe();

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    const response: LoginResponse = {
      success: true,
      mfaRequired: false,
      empId: '1',
      sessionId: 'sess-1',
      firstName: 'Pierre',
      lastName: 'Achkar',
      message: null,
    };
    req.flush(response);

    expect(service.isAuthenticated()).toBe(true);
    expect(service.session()).toEqual({
      empId: '1',
      sessionId: 'sess-1',
      firstName: 'Pierre',
      lastName: 'Achkar',
    });
  });

  it('marks MFA as pending instead of setting a session when required', () => {
    service.login('pierre.achkar@3linc.com', 'Setup123!').subscribe();

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    req.flush({
      success: true,
      mfaRequired: true,
      empId: '1',
      sessionId: 'sess-1',
      message: null,
    } satisfies LoginResponse);

    expect(service.isAuthenticated()).toBe(false);
    expect(service.mfaPending()).toBe(true);
  });

  it('resolves the pending MFA state and sets the session once verified', () => {
    service.login('pierre.achkar@3linc.com', 'Setup123!').subscribe();
    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN')
      .flush({ success: true, mfaRequired: true, empId: '1', sessionId: 'sess-1', message: null });

    service.verifyMfa('123456').subscribe();
    const verifyReq = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    expect(verifyReq.request.body).toEqual({
      empId: '1',
      sessionId: 'sess-1',
      code: '123456',
      action: 'MFA1',
    });
    verifyReq.flush({
      success: true,
      mfaRequired: false,
      empId: '1',
      sessionId: 'sess-1',
      firstName: 'Pierre',
      lastName: 'Achkar',
      message: null,
    } satisfies LoginResponse);

    expect(service.mfaPending()).toBe(false);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('clears the session and any pending MFA state on logout', () => {
    service.login('pierre.achkar@3linc.com', 'Setup123!').subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN').flush({
      success: true,
      mfaRequired: false,
      empId: '1',
      sessionId: 'sess-1',
      message: null,
    } satisfies LoginResponse);

    expect(service.isAuthenticated()).toBe(true);
    service.logout();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.mfaPending()).toBe(false);
  });
});
