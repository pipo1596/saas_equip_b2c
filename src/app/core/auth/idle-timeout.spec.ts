import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { TenantSettings, TenantSettingsService } from '../tenant/tenant-settings';
import { AuthService } from './auth';
import { FAKE_SESSION } from './auth.testing';
import { IdleTimeoutService } from './idle-timeout';

const SESSION = FAKE_SESSION;

const TENANT_SETTINGS: TenantSettings = {
  tp_id: 2,
  cont_name: 'Test Contact',
  pric_eml: 'contact@example.com',
  pric_phn: '555-0100',
  adm_ct_eml: 'admin@example.com',
  adm_ct_phn: '555-0101',
  supprt_name: null,
  supprt_eml: null,
  comp_name: 'Test Company',
  dflt_lang: 'EN',
  bilng_mode: 'N',
  timezone: 'America/Halifax',
  currency: 'CAD',
  fisc_yr_mo: 11,
  addr_line1: '123 Test St',
  addr_line2: 'Suite 100',
  city: 'Testville',
  province: 'NS',
  postal_code: 'A1A 1A1',
  country: 'CA',
  mfa_reqd: 'Y',
  ses_timeout: 15,
  data_resid: 'CA',
  logo_url: '',
  sup_logo_url: '',
  login_img: '',
  hero_img: '',
  men_clth_im: '',
  men_ftw_im: '',
  men_gear_im: '',
  instag_url: '',
  facebk_url: '',
  youtub_url: '',
  linkdin_url: '',
  twiter_url: '',
  shopng_url: 'f',
  meas_sys: 'METRIC',
  welcom_copy: '',
  alert_copy: '',
  hero_copy: '',
  shop_copy: '',
  botm_copy: '',
  copyrg_txt: '',
  privcyinfo: '',
  termsinfo: '',
  retnsinfo: '',
  idpcfgjsn: null,
  updated_by: '',
  created_ts: '',
  updated_ts: '',
};

describe('IdleTimeoutService', () => {
  let authService: AuthService;
  let tenantSettingsService: TenantSettingsService;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    authService = TestBed.inject(AuthService);
    tenantSettingsService = TestBed.inject(TenantSettingsService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Restores jsdom's own prototype getter for any test that overrode
    // `document.visibilityState` with an own property below.
    delete (document as { visibilityState?: unknown }).visibilityState;
    localStorage.clear();
    sessionStorage.clear();
  });

  it('does not arm a timer with no session, even once the tenant timeout is known', () => {
    vi.useFakeTimers();
    TestBed.inject(IdleTimeoutService);
    tenantSettingsService.settings.set(TENANT_SETTINGS);
    TestBed.tick();

    vi.advanceTimersByTime(60 * 60_000);

    expect(authService.isAuthenticated()).toBe(false);
  });

  it('does not log out while the tenant timeout is still unknown', () => {
    vi.useFakeTimers();
    TestBed.inject(IdleTimeoutService);
    authService.session.set(SESSION);
    TestBed.tick();

    vi.advanceTimersByTime(60 * 60_000);

    expect(authService.isAuthenticated()).toBe(true);
  });

  it('logs out and returns to the login page after ses_timeout minutes of inactivity', () => {
    vi.useFakeTimers();
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    TestBed.inject(IdleTimeoutService);
    authService.session.set(SESSION);
    tenantSettingsService.settings.set(TENANT_SETTINGS);
    TestBed.tick();

    vi.advanceTimersByTime(15 * 60_000 - 1);
    expect(authService.isAuthenticated()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(authService.isAuthenticated()).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith('/');
  });

  it('resets the countdown on activity, logging out ses_timeout minutes after the last activity', () => {
    vi.useFakeTimers();
    TestBed.inject(IdleTimeoutService);
    authService.session.set(SESSION);
    tenantSettingsService.settings.set(TENANT_SETTINGS);
    TestBed.tick();

    vi.advanceTimersByTime(10 * 60_000);
    document.dispatchEvent(new Event('keydown'));

    vi.advanceTimersByTime(10 * 60_000);
    // 20 minutes have passed in total, but the last 10 followed fresh
    // activity, so the 15-minute timeout hasn't actually elapsed since then.
    expect(authService.isAuthenticated()).toBe(true);

    vi.advanceTimersByTime(5 * 60_000);
    expect(authService.isAuthenticated()).toBe(false);
  });

  it('stops counting down once the session ends some other way (e.g. a manual log out)', () => {
    vi.useFakeTimers();
    TestBed.inject(IdleTimeoutService);
    authService.session.set(SESSION);
    tenantSettingsService.settings.set(TENANT_SETTINGS);
    TestBed.tick();

    authService.logout();
    TestBed.tick();

    vi.advanceTimersByTime(60 * 60_000);
    expect(authService.isAuthenticated()).toBe(false);
  });

  it('clears the persisted last-activity timestamp once the session ends', () => {
    vi.useFakeTimers();
    TestBed.inject(IdleTimeoutService);
    authService.session.set(SESSION);
    tenantSettingsService.settings.set(TENANT_SETTINGS);
    TestBed.tick();
    expect(localStorage.getItem('idleTimeout.lastActivityAt')).not.toBeNull();

    authService.logout();
    TestBed.tick();

    expect(localStorage.getItem('idleTimeout.lastActivityAt')).toBeNull();
  });

  it('logs out immediately on becoming visible again if the timeout already elapsed while backgrounded', () => {
    vi.useFakeTimers();
    // jsdom's default `visibilityState` is 'prerender', not 'visible' —
    // stubbed here to match what a real browser reports once a tab is
    // actually looked at again, which is what the check in production cares
    // about.
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    TestBed.inject(IdleTimeoutService);
    authService.session.set(SESSION);
    tenantSettingsService.settings.set(TENANT_SETTINGS);
    TestBed.tick();

    // Simulates a tab whose own timer got throttled or paused (backgrounded,
    // or the machine slept) for longer than it was actually scheduled for —
    // backdating the persisted timestamp directly rather than waiting real
    // time out via the fake-timer clock.
    localStorage.setItem('idleTimeout.lastActivityAt', String(Date.now() - 20 * 60_000));

    document.dispatchEvent(new Event('visibilitychange'));

    expect(authService.isAuthenticated()).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith('/');
  });

  it('does not log out on becoming visible again if the timeout has not actually elapsed yet', () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    TestBed.inject(IdleTimeoutService);
    authService.session.set(SESSION);
    tenantSettingsService.settings.set(TENANT_SETTINGS);
    TestBed.tick();

    localStorage.setItem('idleTimeout.lastActivityAt', String(Date.now() - 5 * 60_000));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(authService.isAuthenticated()).toBe(true);

    // Only 10 of the remaining 10 minutes have passed since the backdated
    // timestamp above (5 already elapsed + 10 more = 15) — it should still
    // log out right on schedule from that real anchor, not from whenever
    // this tab happened to notice.
    vi.advanceTimersByTime(10 * 60_000 - 1);
    expect(authService.isAuthenticated()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(authService.isAuthenticated()).toBe(false);
  });

  it('reschedules instead of logging out when a sibling tab reports fresher activity', () => {
    vi.useFakeTimers();
    TestBed.inject(IdleTimeoutService);
    authService.session.set(SESSION);
    tenantSettingsService.settings.set(TENANT_SETTINGS);
    TestBed.tick();

    vi.advanceTimersByTime(14 * 60_000);
    // A sibling tab of the same session recorded activity just now.
    const freshActivity = Date.now();
    localStorage.setItem('idleTimeout.lastActivityAt', String(freshActivity));
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'idleTimeout.lastActivityAt', newValue: String(freshActivity) }),
    );

    // Without reacting to that, this tab's own timer (armed 14 minutes ago)
    // would have logged out within another minute regardless.
    vi.advanceTimersByTime(2 * 60_000);
    expect(authService.isAuthenticated()).toBe(true);
  });
});
