import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { ShopAs } from './shop-as';

describe('ShopAs', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ShopAs],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
  });

  it('should create', () => {
    history.replaceState(null, '', '/shop-as#t=abc123');
    const fixture = TestBed.createComponent(ShopAs);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('strips the token from the address bar immediately, before the network call', () => {
    history.replaceState(null, '', '/shop-as#t=abc123');
    const fixture = TestBed.createComponent(ShopAs);
    fixture.detectChanges();

    expect(location.hash).toBe('');
    expect(location.pathname).toBe('/shop-as');
    TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
  });

  it('posts SHOPAS1 with the token and navigates to /home (replacing) on success', async () => {
    history.replaceState(null, '', '/shop-as#t=9f3c-token');
    const fixture = TestBed.createComponent(ShopAs);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();

    const req = TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
    expect(req.request.body).toEqual({ action: 'SHOPAS1', token: '9f3c-token' });
    req.flush({
      success: true,
      empId: 'E1',
      source: 'L',
      sessionId: 'S1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      actorName: 'Pat Admin',
      actorLevel: 'L1',
      message: null,
    });
    TestBed.inject(HttpTestingController).expectOne('/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE').flush({ empId: 'E1' });

    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith('/home', { replaceUrl: true });
  });

  it('shows the full-page expired-link message on a failed redeem, with no retry', () => {
    history.replaceState(null, '', '/shop-as#t=bad-token');
    const fixture = TestBed.createComponent(ShopAs);
    fixture.detectChanges();

    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN')
      .flush({ success: false, message: 'This shop-as link is invalid, has expired, or was already used.' });

    return fixture.whenStable().then(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance.state()).toBe('error');
      expect(fixture.nativeElement.textContent).toContain(
        'This shop-as link is invalid, has expired, or was already used.',
      );
      expect(fixture.nativeElement.querySelector('button')).toBeNull();
    });
  });

  it('shows the expired-link message immediately when there is no token at all, with no network call', () => {
    history.replaceState(null, '', '/shop-as');
    const fixture = TestBed.createComponent(ShopAs);
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('error');
    TestBed.inject(HttpTestingController).expectNone('/cgi/APPSCDSPCH?SEPGM=APCLOGIN');
  });

  it('shows a generic error message on a network failure', () => {
    history.replaceState(null, '', '/shop-as#t=abc123');
    const fixture = TestBed.createComponent(ShopAs);
    fixture.detectChanges();

    TestBed.inject(HttpTestingController)
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCLOGIN')
      .error(new ProgressEvent('error'));

    return fixture.whenStable().then(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance.state()).toBe('error');
      expect(fixture.nativeElement.textContent).toContain('Go back to the admin console');
    });
  });
});
