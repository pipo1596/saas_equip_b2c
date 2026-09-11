import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Login } from './login';
import { LoginResponse } from '../../../core/auth/auth';

describe('Login', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(Login);
    const login = fixture.componentInstance;
    expect(login).toBeTruthy();
  });

  it('should be invalid when submitted empty', () => {
    const fixture = TestBed.createComponent(Login);
    const login = fixture.componentInstance;
    login.onSubmit();
    expect(login.form.invalid).toBe(true);
    expect(login.form.controls.email.touched).toBe(true);
  });

  it('should toggle password visibility', () => {
    const fixture = TestBed.createComponent(Login);
    const login = fixture.componentInstance;
    expect(login.showPassword()).toBe(false);
    login.togglePasswordVisibility();
    expect(login.showPassword()).toBe(true);
  });

  it('should call APCLOGIN and navigate home on success', async () => {
    const fixture = TestBed.createComponent(Login);
    const login = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    login.form.setValue({ email: 'pierre.achkar@3linc.com', password: 'Setup123!' });
    const submitPromise = login.onSubmit();

    const req = TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      email: 'pierre.achkar@3linc.com',
      password: 'Setup123!',
      action: 'LOGIN1',
    });

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
    await submitPromise;

    expect(navigateSpy).toHaveBeenCalledWith('/home');
    expect(login.loginError()).toBeNull();
  });

  it('should show the API message and not navigate on failed login', async () => {
    const fixture = TestBed.createComponent(Login);
    const login = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    login.form.setValue({ email: 'pierre.achkar@3linc.com', password: 'wrong' });
    const submitPromise = login.onSubmit();

    const req = TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    const response: LoginResponse = {
      success: false,
      mfaRequired: false,
      empId: '',
      sessionId: '',
      firstName: '',
      lastName: '',
      message: 'Incorrect email or password.',
    };
    req.flush(response);
    await submitPromise;

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(login.loginError()).toBe('Incorrect email or password.');
  });

  it('should navigate to /mfa when the API requires a second factor', async () => {
    const fixture = TestBed.createComponent(Login);
    const login = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    login.form.setValue({ email: 'pierre.achkar@3linc.com', password: 'Setup123!' });
    const submitPromise = login.onSubmit();

    const req = TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    const response: LoginResponse = {
      success: true,
      mfaRequired: true,
      empId: '1',
      sessionId: '000000825220001251507245121294',
      message: null,
    };
    req.flush(response);
    await submitPromise;

    expect(navigateSpy).toHaveBeenCalledWith('/mfa');
    expect(login.loginError()).toBeNull();
  });
});
