import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService, LoginResponse } from './auth';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('starts out unauthenticated with no MFA pending', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.mfaPending()).toBe(false);
  });

  it('discards a cached session from before `locations` existed on the Session shape', () => {
    localStorage.setItem(
      'auth.session',
      JSON.stringify({ empId: '1', sessionId: 's', firstName: 'P', lastName: 'A' }),
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const restored = TestBed.inject(AuthService);

    expect(restored.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('auth.session')).toBeNull();
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

    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE')
      .flush({ empId: '1', firstName: 'Pierre', lastName: 'Achkar' });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.session()).toEqual({
      empId: '1',
      sessionId: 'sess-1',
      firstName: 'Pierre',
      lastName: 'Achkar',
      locations: [],
    });
  });

  it('carries the locations from the employee record into the session (LOGIN1 does not return them)', () => {
    service.login('pierre.achkar@3linc.com', 'Setup123!').subscribe();

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN').flush({
      success: true,
      mfaRequired: false,
      empId: '1',
      sessionId: 'sess-1',
      firstName: 'Pierre',
      lastName: 'Achkar',
      message: null,
    } satisfies LoginResponse);

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE').flush({
      empId: '1',
      firstName: 'Pierre',
      lastName: 'Achkar',
      locations: [
        { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Edmonton Fire Dept Chief' },
      ],
    });

    expect(service.session()?.locations).toEqual([
      { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Edmonton Fire Dept Chief' },
    ]);
  });

  it('fetches the employee record right after login and uses it as the source of truth for the name', () => {
    service.login('pierre.achkar@3linc.com', 'Setup123!').subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN').flush({
      success: true,
      mfaRequired: false,
      empId: '1',
      sessionId: 'sess-1',
      firstName: 'P',
      lastName: 'A',
      message: null,
    } satisfies LoginResponse);

    const employeeReq = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE');
    expect(employeeReq.request.body).toEqual({ empId: '1', sessionId: 'sess-1', action: '*GET' });
    employeeReq.flush({ empId: '1', firstName: 'Pierre', lastName: 'Achkar' });

    expect(service.session()).toEqual({
      empId: '1',
      sessionId: 'sess-1',
      firstName: 'Pierre',
      lastName: 'Achkar',
      locations: [],
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

    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE')
      .flush({ empId: '1', firstName: 'Pierre', lastName: 'Achkar' });

    expect(service.mfaPending()).toBe(false);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('falls back to the pending challenge\'s empId/sessionId when the MFA1 success response omits them, and survives a refresh', () => {
    service.login('pierre.achkar@3linc.com', 'Setup123!').subscribe();
    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN')
      .flush({ success: true, mfaRequired: true, empId: '1', sessionId: 'sess-1', message: null });

    service.verifyMfa('123456').subscribe();
    // The verify response confirms success but — unlike the fixture used
    // elsewhere in this file — doesn't repeat empId/sessionId, which a real
    // MFA1 success response is not guaranteed to do.
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN').flush({
      success: true,
      mfaRequired: false,
      firstName: 'Pierre',
      lastName: 'Achkar',
      message: null,
    } satisfies LoginResponse);
    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE')
      .flush({ empId: '1', firstName: 'Pierre', lastName: 'Achkar', locations: [] });

    expect(service.session()).toEqual(
      expect.objectContaining({ empId: '1', sessionId: 'sess-1' }),
    );

    // Simulate a refresh: a brand new AuthService instance restoring only
    // from what was actually persisted to localStorage.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const restored = TestBed.inject(AuthService);

    expect(restored.isAuthenticated()).toBe(true);
    expect(restored.session()).toEqual(
      expect.objectContaining({ empId: '1', sessionId: 'sess-1' }),
    );
  });

  it('survives a page refresh mid-MFA by restoring the pending challenge from sessionStorage', () => {
    service.login('pierre.achkar@3linc.com', 'Setup123!').subscribe();
    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN')
      .flush({ success: true, mfaRequired: true, empId: '1', sessionId: 'sess-1', message: null });

    // Simulate a refresh: a brand new AuthService instance, same persisted
    // sessionStorage, nothing else carried over from the old instance.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const restored = TestBed.inject(AuthService);

    expect(restored.mfaPending()).toBe(true);

    const httpMockAfterRefresh = TestBed.inject(HttpTestingController);
    restored.verifyMfa('123456').subscribe();
    const verifyReq = httpMockAfterRefresh.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    expect(verifyReq.request.body).toEqual({
      empId: '1',
      sessionId: 'sess-1',
      code: '123456',
      action: 'MFA1',
    });
    verifyReq.flush({ success: true, mfaRequired: false, empId: '1', sessionId: 'sess-1', message: null });
    httpMockAfterRefresh.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE').flush({ empId: '1' });
    httpMockAfterRefresh.verify();
  });

  it('discards a corrupt pending-MFA entry from sessionStorage instead of restoring it', () => {
    sessionStorage.setItem('auth.pendingMfa', JSON.stringify({ empId: '1' }));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const restored = TestBed.inject(AuthService);

    expect(restored.mfaPending()).toBe(false);
    expect(sessionStorage.getItem('auth.pendingMfa')).toBeNull();
  });

  it('clears the persisted pending-MFA entry once verification succeeds', () => {
    service.login('pierre.achkar@3linc.com', 'Setup123!').subscribe();
    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN')
      .flush({ success: true, mfaRequired: true, empId: '1', sessionId: 'sess-1', message: null });
    expect(sessionStorage.getItem('auth.pendingMfa')).not.toBeNull();

    service.verifyMfa('123456').subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN').flush({
      success: true,
      mfaRequired: false,
      empId: '1',
      sessionId: 'sess-1',
      message: null,
    });
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE').flush({ empId: '1' });

    expect(sessionStorage.getItem('auth.pendingMfa')).toBeNull();
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
    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE')
      .flush({ empId: '1', firstName: 'Pierre', lastName: 'Achkar' });

    expect(service.isAuthenticated()).toBe(true);
    service.logout();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.mfaPending()).toBe(false);
  });
});
