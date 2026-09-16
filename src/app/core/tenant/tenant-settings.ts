import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { Observable, finalize, of, shareReplay, tap } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface TenantSettings {
  tp_id: number;
  cont_name: string;
  pric_eml: string;
  pric_phn: string;
  adm_ct_eml: string;
  adm_ct_phn: string;
  supprt_name: string | null;
  supprt_eml: string | null;
  comp_name: string;
  dflt_lang: string;
  bilng_mode: string;
  timezone: string;
  currency: string;
  fisc_yr_mo: number;
  addr_line1: string;
  addr_line2: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  mfa_reqd: string;
  ses_timeout: number;
  data_resid: string;
  logo_url: string;
  sup_logo_url: string;
  login_img: string;
  hero_img: string;
  men_clth_im: string;
  men_ftw_im: string;
  men_gear_im: string;
  instag_url: string;
  facebk_url: string;
  youtub_url: string;
  linkdin_url: string;
  twiter_url: string;
  shopng_url: string;
  meas_sys: string;
  welcom_copy: string;
  alert_copy: string;
  hero_copy: string;
  shop_copy: string;
  botm_copy: string;
  copyrg_txt: string;
  privcyinfo: string;
  termsinfo: string;
  retnsinfo: string;
  idpcfgjsn: string | null;
  updated_by: string;
  created_ts: string;
  updated_ts: string;
}

@Injectable({ providedIn: 'root' })
export class TenantSettingsService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS`;

  readonly settings = signal<TenantSettings | null>(null);
  // True only while a real request is in flight — never for a call that's
  // just handed back the already-cached value, so callers can show a
  // loading state without it firing on every repeat call.
  readonly loading = signal(false);

  private request$: Observable<TenantSettings> | null = null;

  /**
   * Fetches the tenant/partner branding, copy and contact settings once and
   * caches the result — safe to call from multiple places (login, header,
   * footer, home) since later callers reuse the cached value or the same
   * in-flight request instead of re-hitting the API.
   */
  load(): Observable<TenantSettings> {
    const cached = this.settings();
    if (cached) {
      return of(cached);
    }

    if (!this.request$) {
      this.loading.set(true);
      this.request$ = this.http
        .post<TenantSettings>(this.dispatchUrl, { action: '*GET' })
        .pipe(
          tap((settings) => {
            this.settings.set(settings);
            this.applyFavicon(settings.logo_url);
          }),
          finalize(() => this.loading.set(false)),
          shareReplay(1),
        );
    }
    return this.request$;
  }

  private applyFavicon(logoUrl: string): void {
    if (!this.isBrowser || !logoUrl) {
      return;
    }

    let link = this.document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'icon';
      this.document.head.appendChild(link);
    }
    // Don't trust the static `type="image/x-icon"` hint from index.html —
    // the tenant logo can be any image format; let the browser sniff it
    // from the response's real Content-Type instead.
    link.removeAttribute('type');
    link.href = logoUrl;
  }
}
