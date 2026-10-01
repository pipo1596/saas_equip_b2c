import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Login } from './login';
import { LoginResponse } from '../../../core/auth/auth';
import { FAKE_EMP_ID, FAKE_FIRST_NAME, FAKE_LAST_NAME } from '../../../core/auth/auth.testing';
import { TenantSettings } from '../../../core/tenant/tenant-settings';

describe('Login', () => {
  beforeEach(async () => {
    // AuthService persists a successful login to localStorage, which
    // (unlike TestBed's DI container) isn't reset between spec files.
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
    sessionStorage.clear();
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

    login.form.setValue({ email: 'jane.doe@example.com', password: 'TestPass123!' });
    const submitPromise = login.onSubmit();

    const req = TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      email: 'jane.doe@example.com',
      password: 'TestPass123!',
      action: 'LOGIN1',
    });

    const response: LoginResponse = {
      success: true,
      mfaRequired: false,
      empId: FAKE_EMP_ID,
      sessionId: 'sess_test_0001',
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
    expect(login.loginError()).toBeNull();
  });

  it('should show the API message and not navigate on failed login', async () => {
    const fixture = TestBed.createComponent(Login);
    const login = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    login.form.setValue({ email: 'jane.doe@example.com', password: 'wrong' });
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

    login.form.setValue({ email: 'jane.doe@example.com', password: 'TestPass123!' });
    const submitPromise = login.onSubmit();

    const req = TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    const response: LoginResponse = {
      success: true,
      mfaRequired: true,
      empId: FAKE_EMP_ID,
      sessionId: 'sess_test_0002',
      message: null,
    };
    req.flush(response);
    await submitPromise;

    expect(navigateSpy).toHaveBeenCalledWith('/mfa');
    expect(login.loginError()).toBeNull();
  });

  it('should load tenant branding on init and expose it for the template', () => {
    const fixture = TestBed.createComponent(Login);
    const login = fixture.componentInstance;

    expect(login.tenantSettings()).toBeNull();
    login.ngOnInit();

    const req = TestBed.inject(HttpTestingController).expectOne(
      '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS',
    );
    expect(req.request.body).toEqual({ action: '*GET' });
    req.flush({ logo_url: '/photos/partner-2/logo.jpg' } as TenantSettings);

    expect(login.tenantSettings()?.logo_url).toBe('/photos/partner-2/logo.jpg');
  });

  it('should show the loading gate as soon as tenant settings start loading', () => {
    const fixture = TestBed.createComponent(Login);
    const login = fixture.componentInstance;

    expect(login.showLoadingGate()).toBe(false);
    login.ngOnInit();

    expect(login.showLoadingGate()).toBe(true);

    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({
        logo_url: '/photos/partner-2/logo.jpg',
        sup_logo_url: '/photos/partner-2/logo.jpg',
      } as TenantSettings);

    expect(login.showLoadingGate()).toBe(false);
  });
});
