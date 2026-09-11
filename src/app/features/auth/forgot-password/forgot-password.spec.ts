import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { ForgotPassword } from './forgot-password';

describe('ForgotPassword', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('should create, starting on the request step', () => {
    const fixture = TestBed.createComponent(ForgotPassword);
    expect(fixture.componentInstance.step()).toBe('request');
  });

  it('should require a valid email before requesting a code', () => {
    const fixture = TestBed.createComponent(ForgotPassword);
    const page = fixture.componentInstance;
    page.submitRequest();
    expect(page.requestForm.invalid).toBe(true);
    expect(page.requestForm.controls.email.touched).toBe(true);
  });

  it('should advance to the reset step once a code is requested', async () => {
    const fixture = TestBed.createComponent(ForgotPassword);
    const page = fixture.componentInstance;

    page.requestForm.setValue({ email: 'pierre.achkar@3linc.com' });
    const submitPromise = page.submitRequest();

    const req = TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    req.flush({ success: true, message: null });
    await submitPromise;

    expect(page.step()).toBe('reset');
    expect(page.submittedEmail()).toBe('pierre.achkar@3linc.com');
  });

  it('should flag mismatched passwords without calling the API', () => {
    const fixture = TestBed.createComponent(ForgotPassword);
    const page = fixture.componentInstance;

    page.resetForm.setValue({
      code: '123456',
      newPassword: 'Password1!',
      confirmPassword: 'Password2!',
    });

    expect(page.resetForm.hasError('mismatch')).toBe(true);
  });

  it('should reach the done step on a successful reset', async () => {
    const fixture = TestBed.createComponent(ForgotPassword);
    const page = fixture.componentInstance;
    page.submittedEmail.set('pierre.achkar@3linc.com');
    page.step.set('reset');

    page.resetForm.setValue({
      code: '123456',
      newPassword: 'Password1!',
      confirmPassword: 'Password1!',
    });
    const submitPromise = page.submitReset();

    const req = TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    req.flush({ success: true, message: null });
    await submitPromise;

    expect(page.step()).toBe('done');
  });
});
