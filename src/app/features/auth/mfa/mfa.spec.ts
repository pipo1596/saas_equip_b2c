import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AuthService, LoginResponse } from '../../../core/auth/auth';
import { FAKE_EMP_ID, FAKE_FIRST_NAME, FAKE_LAST_NAME } from '../../../core/auth/auth.testing';
import { Mfa } from './mfa';

// Puts the service into the same "mid-challenge" state a real login would
// have left it in — `resendMfa` only has credentials to replay once this
// has happened.
function startPendingChallenge(httpMock: HttpTestingController): void {
  TestBed.inject(AuthService).login('jane.doe@example.com', 'TestPass123!').subscribe();
  httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN').flush({
    success: true,
    mfaRequired: true,
    empId: FAKE_EMP_ID,
    sessionId: 'sess_test_0004',
    message: null,
  } satisfies LoginResponse);
}

describe('Mfa', () => {
  beforeEach(async () => {
    // AuthService persists a successful verification to localStorage,
    // which (unlike TestBed's DI container) isn't reset between spec files.
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Mfa],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(Mfa);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should be invalid when submitted empty, and only then flag it', () => {
    const fixture = TestBed.createComponent(Mfa);
    const mfa = fixture.componentInstance;
    expect(mfa.submitted()).toBe(false);
    mfa.onSubmit();
    expect(mfa.digits.invalid).toBe(true);
    expect(mfa.submitted()).toBe(true);
  });

  it('should verify the code and navigate home on success', async () => {
    const fixture = TestBed.createComponent(Mfa);
    const mfa = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    mfa.digits.setValue(['1', '2', '3', '4', '5', '6']);
    const submitPromise = mfa.onSubmit();

    const req = TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    expect(req.request.body.code).toBe('123456');

    const response: LoginResponse = {
      success: true,
      mfaRequired: false,
      empId: FAKE_EMP_ID,
      sessionId: 'sess_test_0004',
      firstName: FAKE_FIRST_NAME,
      lastName: FAKE_LAST_NAME,
      message: null,
    };
    req.flush(response);

    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE')
      .flush({ empId: FAKE_EMP_ID, firstName: FAKE_FIRST_NAME, lastName: FAKE_LAST_NAME });

    await submitPromise;

    expect(navigateSpy).toHaveBeenCalledWith('/home');
    expect(mfa.error()).toBeNull();
  });

  it('should show the API message and not navigate on an invalid code', async () => {
    const fixture = TestBed.createComponent(Mfa);
    const mfa = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    mfa.digits.setValue(['0', '0', '0', '0', '0', '0']);
    const submitPromise = mfa.onSubmit();

    const req = TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    req.flush({ success: false, message: 'That code was not valid.' });
    await submitPromise;

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(mfa.error()).toBe('That code was not valid.');
  });

  describe('resend', () => {
    it('should replay the original login call, clear the digits, and show a confirmation on success', async () => {
      const httpMock = TestBed.inject(HttpTestingController);
      startPendingChallenge(httpMock);

      const fixture = TestBed.createComponent(Mfa);
      const mfa = fixture.componentInstance;
      fixture.detectChanges();

      mfa.digits.setValue(['1', '2', '3', '4', '5', '6']);
      const resendPromise = mfa.resendCode();

      expect(mfa.resending()).toBe(true);
      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
      expect(req.request.body).toEqual({
        email: 'jane.doe@example.com',
        password: 'TestPass123!',
        action: 'LOGIN1',
      });
      req.flush({
        success: true,
        mfaRequired: true,
        empId: FAKE_EMP_ID,
        sessionId: 'sess_test_0005',
        message: null,
      } satisfies LoginResponse);
      await resendPromise;

      expect(mfa.resending()).toBe(false);
      expect(mfa.resent()).toBe(true);
      expect(mfa.digits.value).toEqual(['', '', '', '', '', '']);

      fixture.detectChanges();
      const banner: HTMLElement = fixture.nativeElement.querySelector('.alert-success');
      expect(banner.textContent).toContain('A new code is on its way.');
    });

    it('should show the API message and keep the entered digits when the resend fails', async () => {
      const httpMock = TestBed.inject(HttpTestingController);
      startPendingChallenge(httpMock);

      const fixture = TestBed.createComponent(Mfa);
      const mfa = fixture.componentInstance;

      mfa.digits.setValue(['1', '2', '3', '4', '5', '6']);
      const resendPromise = mfa.resendCode();

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN')
        .flush({ success: false, message: 'Too many attempts. Try again later.' });
      await resendPromise;

      expect(mfa.error()).toBe('Too many attempts. Try again later.');
      expect(mfa.resent()).toBe(false);
      expect(mfa.digits.value).toEqual(['1', '2', '3', '4', '5', '6']);
    });

    it('should navigate home if the replayed login no longer requires MFA', async () => {
      const httpMock = TestBed.inject(HttpTestingController);
      startPendingChallenge(httpMock);

      const fixture = TestBed.createComponent(Mfa);
      const mfa = fixture.componentInstance;
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigateByUrl');

      const resendPromise = mfa.resendCode();
      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN').flush({
        success: true,
        mfaRequired: false,
        empId: FAKE_EMP_ID,
        sessionId: 'sess_test_0005',
        firstName: FAKE_FIRST_NAME,
        lastName: FAKE_LAST_NAME,
        message: null,
      } satisfies LoginResponse);
      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE')
        .flush({ empId: FAKE_EMP_ID, firstName: FAKE_FIRST_NAME, lastName: FAKE_LAST_NAME });
      await resendPromise;

      expect(navigateSpy).toHaveBeenCalledWith('/home');
    });

    it("should send the employee back to sign in when there's no session to replay (e.g. after a refresh)", async () => {
      const fixture = TestBed.createComponent(Mfa);
      const mfa = fixture.componentInstance;
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigateByUrl');

      await mfa.resendCode();

      expect(mfa.error()).toBe('Your session has expired. Please sign in again.');
      expect(navigateSpy).toHaveBeenCalledWith('/');
    });

    it('should clear the confirmation once the user starts entering a new code', async () => {
      const httpMock = TestBed.inject(HttpTestingController);
      startPendingChallenge(httpMock);

      const fixture = TestBed.createComponent(Mfa);
      const mfa = fixture.componentInstance;
      fixture.detectChanges();

      const resendPromise = mfa.resendCode();
      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN').flush({
        success: true,
        mfaRequired: true,
        empId: FAKE_EMP_ID,
        sessionId: 'sess_test_0005',
        message: null,
      } satisfies LoginResponse);
      await resendPromise;
      expect(mfa.resent()).toBe(true);

      const input: HTMLInputElement = fixture.nativeElement.querySelector('.otp__digit');
      input.value = '7';
      input.dispatchEvent(new Event('input'));

      expect(mfa.resent()).toBe(false);
    });
  });
});
