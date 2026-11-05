import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TenantSettingsService } from '../../core/tenant/tenant-settings';
import { Footer } from '../../shared/footer/footer';
import { Header } from '../../shared/header/header';

export type SupportResourceIcon = 'sizing' | 'videos' | 'announcements' | 'contact';

// Mirrors `NoticeLink`'s own route-vs-external split (see
// `core/announcements/announcements.ts`) — an internal destination like
// Announcements should navigate via the router, not a plain `href`.
export type SupportResourceLink = { kind: 'route'; routerLink: string } | { kind: 'external'; href: string };

interface SupportResource {
  icon: SupportResourceIcon;
  title: string;
  description: string;
  link: SupportResourceLink;
}

@Component({
  selector: 'app-support-page',
  imports: [Header, Footer, RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './support-page.html',
  styleUrls: ['../../shared/shared.css', './support-page.css'],
})
export class SupportPage {
  private readonly tenantSettingsService = inject(TenantSettingsService);

  // Falls back the same way the footer's own "Department support" block
  // does, until the tenant's settings load (or if the tenant hasn't set a
  // dedicated support contact).
  readonly supportEmail = computed(() => {
    const tenant = this.tenantSettingsService.settings();
    return tenant?.supprt_eml || tenant?.pric_eml || 'support@uniformworks.ca';
  });

  // A deliberately short starter list — this screen exists so there's one
  // place to add more resources (sizing guide content, platform
  // walkthrough videos, FAQs, ...) as they're built out; "Announcements"
  // and "Contact support" are the two real destinations today.
  readonly resources = computed<SupportResource[]>(() => [
    {
      icon: 'sizing',
      title: 'Sizing guide',
      description: 'Find your fit before you order.',
      link: { kind: 'external', href: '#' },
    },
    {
      icon: 'videos',
      title: 'Platform videos',
      description: 'Step-by-step tutorials for using this portal.',
      link: { kind: 'external', href: '#' },
    },
    {
      icon: 'announcements',
      title: 'Announcements',
      description: 'Updates, policies, and key info from your department.',
      link: { kind: 'route', routerLink: '/announcements' },
    },
    {
      icon: 'contact',
      title: 'Contact support',
      description: 'Reach your uniform support team directly.',
      link: { kind: 'external', href: `mailto:${this.supportEmail()}` },
    },
  ]);
}
