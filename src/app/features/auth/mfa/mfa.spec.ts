import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { LoginResponse } from '../../../core/auth/auth';
import { Mfa } from './mfa';

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
      empId: '1',
      sessionId: '000000825220001251507245121294',
      firstName: 'Pierre',
      lastName: 'Achkar',
      message: null,
    };
    req.flush(response);

    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE')
      .flush({ empId: '1', firstName: 'Pierre', lastName: 'Achkar' });

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
});
