import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TenantSettings, TenantSettingsService } from './tenant-settings';

const SAMPLE: TenantSettings = {
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
  logo_url: '/photos/partner-2/logo.jpg',
  sup_logo_url: '/photos/partner-2/logo.jpg',
  login_img: '/photos/partner-2/login.jpg',
  hero_img: '/photos/partner-2/hero.jpg',
  men_clth_im: '/photos/partner-2/cloth.jpg',
  men_ftw_im: '/photos/partner-2/foot.jpg',
  men_gear_im: '/photos/partner-2/gear.jpg',
  instag_url: 'instagram.com/test',
  facebk_url: 'facebook.com/test',
  youtub_url: 'youtube.com/test',
  linkdin_url: 'linkedin.com/test',
  twiter_url: 'x.com/test',
  shopng_url: 'f',
  meas_sys: 'METRIC',
  welcom_copy: 'Welcome',
  alert_copy: 'Alert',
  hero_copy: 'Hero',
  shop_copy: 'Shop',
  botm_copy: 'Bottom',
  copyrg_txt: 'Copyright 2026 Test Company. All rights reserved.',
  privcyinfo: '',
  termsinfo: '',
  retnsinfo: '',
  idpcfgjsn: null,
  updated_by: '',
  created_ts: '2026-01-01 00:00:00',
  updated_ts: '2026-01-01 00:00:00',
};

describe('TenantSettingsService', () => {
  let service: TenantSettingsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TenantSettingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts with no cached settings', () => {
    expect(service.settings()).toBeNull();
  });

  it('fetches and caches the settings', () => {
    let result: TenantSettings | undefined;
    service.load().subscribe((settings) => (result = settings));

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ action: '*GET' });
    req.flush(SAMPLE);

    expect(result).toEqual(SAMPLE);
    expect(service.settings()).toEqual(SAMPLE);
  });

  it('is loading only while the request is in flight', () => {
    expect(service.loading()).toBe(false);

    service.load().subscribe();
    expect(service.loading()).toBe(true);

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush(SAMPLE);
    expect(service.loading()).toBe(false);
  });

  it('stops loading even when the request fails', () => {
    service.load().subscribe({ error: () => {} });
    expect(service.loading()).toBe(true);

    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush('failure', { status: 500, statusText: 'Server Error' });

    expect(service.loading()).toBe(false);
  });

  it('does not report loading for a call that just returns the cached value', () => {
    service.load().subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush(SAMPLE);

    service.load().subscribe();
    expect(service.loading()).toBe(false);
  });

  it('does not issue a second request once cached', () => {
    service.load().subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush(SAMPLE);

    let result: TenantSettings | undefined;
    service.load().subscribe((settings) => (result = settings));

    httpMock.expectNone('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS');
    expect(result).toEqual(SAMPLE);
  });

  it('shares a single in-flight request across concurrent callers', () => {
    let first: TenantSettings | undefined;
    let second: TenantSettings | undefined;
    service.load().subscribe((settings) => (first = settings));
    service.load().subscribe((settings) => (second = settings));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush(SAMPLE);

    expect(first).toEqual(SAMPLE);
    expect(second).toEqual(SAMPLE);
  });

  it('sets the page favicon to the tenant logo once loaded', () => {
    document.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());

    service.load().subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush(SAMPLE);

    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toContain(SAMPLE.logo_url);
    expect(link?.hasAttribute('type')).toBe(false);
  });

  it('reuses an existing favicon link instead of adding a second one', () => {
    document.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());
    const existing = document.createElement('link');
    existing.rel = 'icon';
    existing.type = 'image/x-icon';
    existing.href = '';
    document.head.appendChild(existing);

    service.load().subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush(SAMPLE);

    expect(document.querySelectorAll('link[rel="icon"]').length).toBe(1);
    expect(existing.getAttribute('href')).toContain(SAMPLE.logo_url);
  });
});
