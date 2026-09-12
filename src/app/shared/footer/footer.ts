import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
} from '@angular/core';

import { TenantSettingsService } from '../../core/tenant/tenant-settings';

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) {
    return null;
  }
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function toTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

@Component({
  selector: 'app-footer',
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './footer.html',
  styleUrls: ['../shared.css', './footer.css'],
})
export class Footer implements OnInit {
  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tenantSettings = this.tenantSettingsService.settings;
  readonly currentYear = new Date().getFullYear();

  // Department support falls back to these placeholder values until the
  // tenant's own contact settings load (or if a field is left blank).
  readonly departmentContact = computed(() => {
    const tenant = this.tenantSettings();
    const name = tenant?.cont_name || 'Lt. J. Lufrano';
    const phone = tenant?.pric_phn || '1-800-SEAVIEW';
    const email = tenant?.pric_eml || 'J.Lufrano@SeaviewSecurity.com';
    return { name, phone, phoneHref: toTelHref(phone), email };
  });

  readonly departmentAddress = computed(() => {
    const tenant = this.tenantSettings();
    if (!tenant?.addr_line1) {
      return null;
    }
    const cityLine = [tenant.city, tenant.province].filter(Boolean).join(', ');
    return {
      line1: tenant.addr_line1,
      line2: tenant.addr_line2 || null,
      cityLine: [cityLine, tenant.postal_code].filter(Boolean).join(' '),
    };
  });

  readonly socialLinks = computed(() => {
    const tenant = this.tenantSettings();
    return {
      facebook: normalizeUrl(tenant?.facebk_url),
      twitter: normalizeUrl(tenant?.twiter_url),
      instagram: normalizeUrl(tenant?.instag_url),
      youtube: normalizeUrl(tenant?.youtub_url),
      linkedin: normalizeUrl(tenant?.linkdin_url),
    };
  });

  readonly hasSocialLinks = computed(() => Object.values(this.socialLinks()).some(Boolean));

  ngOnInit(): void {
    if (this.isBrowser) {
      this.tenantSettingsService.load().subscribe();
    }
  }
}
