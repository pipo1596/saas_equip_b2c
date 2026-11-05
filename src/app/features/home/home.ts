import { DatePipe, isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AnnouncementsService,
  NoticeBanner,
  NoticeLink,
  noticeLink,
  noticeStyleClass,
} from '../../core/announcements/announcements';
import { AuthService } from '../../core/auth/auth';
import { formatBalanceAmount, meterPct, tileBalance } from '../../core/cart/allotment';
import { CartService } from '../../core/cart/cart';
import { CatalogViewService } from '../../core/catalog/catalog-view';
import { LocationSelectionService } from '../../core/location/location-selection';
import { TenantSettingsService } from '../../core/tenant/tenant-settings';
import { Footer } from '../../shared/footer/footer';
import { Header } from '../../shared/header/header';

export type QuickActionIcon = 'account' | 'orders' | 'announcements' | 'approvals' | 'support';

export interface QuickAction {
  icon: QuickActionIcon;
  title: string;
  description: string;
  routerLink: string;
}

// The "Your portal" tile grid — always these, in this order, regardless of
// the viewer. "Approval dashboard" isn't here: it's inserted into
// `quickActions` only for an employee who can actually approve (see
// `approvals()` below), the same `canApprove` flag the header's own
// Approvals link and the hero's approvals stat already gate on.
const BASE_QUICK_ACTIONS: QuickAction[] = [
  { icon: 'account', title: 'My account', description: 'View and edit your profile and sizes', routerLink: '/account' },
  { icon: 'orders', title: 'Order history', description: 'Track shipments and reorder past items', routerLink: '/orders' },
  {
    icon: 'announcements',
    title: 'Announcements',
    description: 'Updates, policies, and key info',
    routerLink: '/announcements',
  },
  {
    icon: 'support',
    title: 'Support & resources',
    description: 'Help with this shopping platform',
    routerLink: '/support',
  },
];

@Component({
  selector: 'app-home',
  imports: [Header, Footer, RouterLink, NgOptimizedImage, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
  styleUrls: ['../../shared/shared.css', './home.css'],
})
export class Home implements OnInit {
  @ViewChild('categoryTrack') private readonly categoryTrack?: ElementRef<HTMLElement>;

  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly announcementsService = inject(AnnouncementsService);
  private readonly authService = inject(AuthService);
  private readonly catalogViewService = inject(CatalogViewService);
  private readonly locationSelectionService = inject(LocationSelectionService);
  private readonly cartService = inject(CartService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly tenantSettings = this.tenantSettingsService.settings;
  readonly firstName = this.authService.firstName;

  // The home page banner — `null` hides the strip entirely (no notice
  // qualifies, or the call failed; see `AnnouncementsService.banner`).
  readonly banner = signal<NoticeBanner | null>(null);
  readonly bannerStyleClass = computed(() => {
    const notice = this.banner();
    return notice ? noticeStyleClass(notice.style) : '';
  });
  readonly bannerLink = computed<NoticeLink | null>(() => {
    const notice = this.banner();
    return notice ? noticeLink(notice) : null;
  });
  readonly categories = this.catalogViewService.categories;
  readonly activeLocation = this.locationSelectionService.activeLocation;

  // The header already keeps the shared cart (and its allotment block)
  // fresh for the whole app — this page just reads it, rather than
  // triggering its own separate load.
  private readonly allotment = computed(() => this.cartService.cart().allotment);
  readonly allotmentRules = computed(() => this.allotment()?.rules ?? []);
  readonly openOrders = computed(() => this.allotment()?.openOrders ?? null);
  readonly approvals = computed(() => this.allotment()?.approvals ?? null);
  readonly tileBalance = tileBalance;
  readonly meterPct = meterPct;
  readonly formatBalanceAmount = formatBalanceAmount;

  // `BASE_QUICK_ACTIONS` plus "Approval dashboard", inserted right after
  // Order history, only when this employee can approve — everyone else
  // never sees it at all, rather than a dead/blocked link.
  readonly quickActions = computed<QuickAction[]>(() => {
    if (this.approvals()?.canApprove !== 'Y') {
      return BASE_QUICK_ACTIONS;
    }
    const actions = [...BASE_QUICK_ACTIONS];
    actions.splice(2, 0, {
      icon: 'approvals',
      title: 'Approval dashboard',
      description: 'Review and approve pending orders',
      routerLink: '/approvals',
    });
    return actions;
  });

  // Refreshes the "Shop by category" list whenever the active location
  // defaults or changes, same as the header's own catalog menu load.
  private readonly loadCategoriesOnLocationChange = effect(() => {
    const location = this.locationSelectionService.activeLocation();
    if (location && this.isBrowser) {
      this.catalogViewService.loadCategories(location.locationId).subscribe();
    }
  });

  ngOnInit(): void {
    if (this.isBrowser) {
      this.tenantSettingsService.load().subscribe();
      this.announcementsService.banner().subscribe((notice) => this.banner.set(notice));
    }
  }

  scrollCategories(direction: -1 | 1): void {
    const track = this.categoryTrack?.nativeElement;
    if (!track) {
      return;
    }
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: 'smooth' });
  }
}
