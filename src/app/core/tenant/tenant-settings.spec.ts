import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TenantSettings, TenantSettingsService } from './tenant-settings';

const SAMPLE: TenantSettings = {
  tp_id: 2,
  cont_name: 'Seth Bailey',
  pric_eml: 'bailey-seth@galls.com',
  pric_phn: '(902) 468-4314',
  adm_ct_eml: 'sbailey@uniformworks.ca',
  adm_ct_phn: '(902) 468-5367',
  supprt_name: null,
  supprt_eml: null,
  comp_name: 'Uniform Works',
  dflt_lang: 'EN',
  bilng_mode: 'N',
  timezone: 'America/Halifax',
  currency: 'CAD',
  fisc_yr_mo: 11,
  addr_line1: '89 Cutler Ave',
  addr_line2: 'Unit 105',
  city: 'Dartmouth',
  province: 'NS',
  postal_code: 'NS B3B 0J5',
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
  instag_url: 'https://instagram.com',
  facebk_url: 'http://facebook.com',
  youtub_url: 'https://youtube.com',
  linkdin_url: 'https://linkedin.com',
  twiter_url: 'x.com',
  shopng_url: 'f',
  meas_sys: 'METRIC',
  welcom_copy: 'Welcome',
  alert_copy: 'Alert',
  hero_copy: 'Hero',
  shop_copy: 'Shop',
  botm_copy: 'Bottom',
  copyrg_txt: 'Copyright 2026 Uniform Works. All rights reserved.',
  privcyinfo: '',
  termsinfo: '',
  retnsinfo: '',
  idpcfgjsn: null,
  updated_by: '',
  created_ts: '2026-06-08 12:27:52',
  updated_ts: '2026-08-20 21:39:37',
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
    existing.href = 'favicon.ico';
    document.head.appendChild(existing);

    service.load().subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush(SAMPLE);

    expect(document.querySelectorAll('link[rel="icon"]').length).toBe(1);
    expect(existing.getAttribute('href')).toContain(SAMPLE.logo_url);
  });
});
