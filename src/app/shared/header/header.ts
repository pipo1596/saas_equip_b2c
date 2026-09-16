import { CurrencyPipe, NgOptimizedImage, NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService, EmployeeLocation } from '../../core/auth/auth';
import { CatalogCategory, CatalogMenu, CatalogViewService } from '../../core/catalog/catalog-view';
import { LocationSelectionService } from '../../core/location/location-selection';
import { TenantSettings, TenantSettingsService } from '../../core/tenant/tenant-settings';
import { computeAdaptiveLogoHeight } from '../logo-sizing';

type CatalogImageField = keyof Pick<TenantSettings, 'men_clth_im' | 'men_ftw_im' | 'men_gear_im'>;

interface CatalogNavLabel {
  readonly key: keyof CatalogMenu;
  readonly label: string;
  readonly imageField: CatalogImageField;
}

// The wordmark logo box's width always stays capped at this — only its
// height adapts, so a tenant logo that isn't especially wide (closer to
// square) renders taller instead of sitting tiny inside a box shaped for a
// wide banner-style logo.
const WORDMARK_LOGO_WIDTH = 130;
const WORDMARK_LOGO_MIN_HEIGHT = 36;
const WORDMARK_LOGO_MAX_HEIGHT = 52;

const CATALOG_NAV_LABELS: readonly CatalogNavLabel[] = [
  { key: 'clothing', label: 'Clothing', imageField: 'men_clth_im' },
  { key: 'footwear', label: 'Footwear', imageField: 'men_ftw_im' },
  { key: 'gear', label: 'Gear', imageField: 'men_gear_im' },
];

interface DisplayCategory {
  readonly progCatId: number;
  readonly categoryName: string;
  readonly children: readonly DisplayCategory[];
}

interface CatalogNavItem extends CatalogNavLabel {
  readonly categories: readonly DisplayCategory[];
  readonly image: string | null;
  // How many grid columns to actually use — capped at 4, but never more than
  // there are top-level sections, so e.g. 3 sections don't get crammed into
  // 2 columns while a 4th sits empty (an artifact of the browser choosing
  // column-count purely to balance height, not to spread content).
  readonly columnCount: number;
}

// A category whose direct children are all further sub-categories (none of
// them a real leaf item right under it) doesn't get its own header — it's
// collapsed into its descendants' label instead, prefixed with " > ", so a
// leaf never ends up nested three headers deep under nothing but more
// headers with no items of their own.
function buildDisplayCategories(
  categories: readonly CatalogCategory[],
  prefix = '',
): DisplayCategory[] {
  return categories.flatMap((category): DisplayCategory[] => {
    const label = prefix ? `${prefix} > ${category.categoryName}` : category.categoryName;

    if (category.children.length === 0) {
      return [{ progCatId: category.progCatId, categoryName: label, children: [] }];
    }

    const hasDirectLeafChild = category.children.some((child) => child.children.length === 0);
    if (hasDirectLeafChild) {
      return [
        {
          progCatId: category.progCatId,
          categoryName: label,
          children: buildDisplayCategories(category.children),
        },
      ];
    }

    return buildDisplayCategories(category.children, label);
  });
}

interface CartLine {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly price: number;
  readonly qty: number;
}

@Component({
  selector: 'app-header',
  imports: [RouterLink, CurrencyPipe, NgOptimizedImage, ReactiveFormsModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.html',
  styleUrls: ['../shared.css', './header.css'],
})
export class Header implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly catalogViewService = inject(CatalogViewService);
  private readonly locationSelectionService = inject(LocationSelectionService);
  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly clearCatalogNavCloseTimeoutOnDestroy = inject(DestroyRef).onDestroy(() =>
    this.cancelScheduledCatalogNavClose(),
  );

  readonly session = this.authService.session;
  readonly firstName = this.authService.firstName;
  readonly fullName = this.authService.fullName;
  readonly initials = this.authService.initials;

  readonly tenantSettings = this.tenantSettingsService.settings;

  readonly locations = this.authService.locations;
  readonly activeLocation = this.locationSelectionService.activeLocation;

  // Refreshes the catalog menu whenever the active location defaults or
  // changes — both cases flow through `activeLocation`.
  private readonly loadCatalogMenuOnLocationChange = effect(() => {
    const location = this.activeLocation();
    if (location && this.isBrowser) {
      this.catalogViewService.load(location.locationId).subscribe();
    }
  });

  // Only the buckets with categories for this location's menu show up —
  // e.g. a location with no clothing assortment just won't get that tab.
  readonly catalogNavItems = computed<CatalogNavItem[]>(() => {
    const menu = this.catalogViewService.menu();
    if (!menu) {
      return [];
    }
    const tenant = this.tenantSettingsService.settings();
    return CATALOG_NAV_LABELS.map((item) => {
      const categories = buildDisplayCategories(menu[item.key]);
      return {
        ...item,
        categories,
        image: tenant?.[item.imageField] || null,
        columnCount: Math.max(1, Math.min(4, categories.length)),
      };
    }).filter((item) => item.categories.length > 0);
  });

  readonly openCatalogNavKey = signal<CatalogNavLabel['key'] | null>(null);
  readonly activeCatalogNavItem = computed<CatalogNavItem | null>(() => {
    const key = this.openCatalogNavKey();
    return key ? (this.catalogNavItems().find((item) => item.key === key) ?? null) : null;
  });

  // A short grace period between leaving a nav button/the flyout and
  // actually closing it — without it, the gap between the button and the
  // panel below it (they aren't DOM-nested) would close the menu the
  // instant the mouse crosses it. Hovering back over either side cancels
  // the pending close.
  // Defaults to the box's old fixed height until the real logo has loaded
  // and its aspect ratio is known.
  readonly wordmarkLogoHeight = signal(WORDMARK_LOGO_MIN_HEIGHT);

  onWordmarkLogoLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img.naturalWidth || !img.naturalHeight) {
      return;
    }
    this.wordmarkLogoHeight.set(
      computeAdaptiveLogoHeight(
        img.naturalWidth,
        img.naturalHeight,
        WORDMARK_LOGO_WIDTH,
        WORDMARK_LOGO_MIN_HEIGHT,
        WORDMARK_LOGO_MAX_HEIGHT,
      ),
    );
  }

  private closeCatalogNavTimeoutId: ReturnType<typeof setTimeout> | null = null;
  readonly deptMenuOpen = signal(false);
  readonly rulesMenuOpen = signal(false);
  readonly userMenuOpen = signal(false);
  readonly cartOpen = signal(false);

  // `(ngSubmit)` is an output of `FormGroupDirective` (via `[formGroup]`) —
  // without wrapping the control in a group, a bare `<form>` has no
  // directive providing it, so the browser falls back to a native submit
  // (full page reload) instead of calling `search()`.
  readonly searchForm = new FormGroup({
    term: new FormControl('', { nonNullable: true }),
  });

  // No cart/product service exists yet, so this starts empty rather than
  // faking line items — the drawer just shows its empty state for now.
  readonly cartLines = signal<CartLine[]>([]);
  readonly cartCount = computed(() =>
    this.cartLines().reduce((total, line) => total + line.qty, 0),
  );
  readonly cartSubtotal = computed(() =>
    this.cartLines().reduce((total, line) => total + line.price * line.qty, 0),
  );

  ngOnInit(): void {
    if (this.isBrowser) {
      this.tenantSettingsService.load().subscribe();
    }
  }

  search(): void {
    const term = this.searchForm.controls.term.value.trim();
    if (!term) {
      return;
    }
    this.router.navigate(['/products'], { queryParams: { q: term } });
  }

  toggleCatalogNav(key: CatalogNavLabel['key']): void {
    this.cancelScheduledCatalogNavClose();
    this.deptMenuOpen.set(false);
    this.rulesMenuOpen.set(false);
    this.userMenuOpen.set(false);
    this.openCatalogNavKey.update((open) => (open === key ? null : key));
  }

  openCatalogNavOnHover(key: CatalogNavLabel['key']): void {
    this.cancelScheduledCatalogNavClose();
    this.deptMenuOpen.set(false);
    this.rulesMenuOpen.set(false);
    this.userMenuOpen.set(false);
    this.openCatalogNavKey.set(key);
  }

  scheduleCatalogNavClose(): void {
    this.cancelScheduledCatalogNavClose();
    this.closeCatalogNavTimeoutId = setTimeout(() => this.openCatalogNavKey.set(null), 200);
  }

  cancelScheduledCatalogNavClose(): void {
    if (this.closeCatalogNavTimeoutId !== null) {
      clearTimeout(this.closeCatalogNavTimeoutId);
      this.closeCatalogNavTimeoutId = null;
    }
  }

  closeCatalogNav(): void {
    this.cancelScheduledCatalogNavClose();
    this.openCatalogNavKey.set(null);
  }

  toggleDeptMenu(): void {
    this.openCatalogNavKey.set(null);
    this.rulesMenuOpen.set(false);
    this.userMenuOpen.set(false);
    this.deptMenuOpen.update((open) => !open);
  }

  selectLocation(location: EmployeeLocation): void {
    this.locationSelectionService.select(location);
    this.deptMenuOpen.set(false);
  }

  toggleRulesMenu(): void {
    this.openCatalogNavKey.set(null);
    this.deptMenuOpen.set(false);
    this.userMenuOpen.set(false);
    this.rulesMenuOpen.update((open) => !open);
  }

  toggleUserMenu(): void {
    this.openCatalogNavKey.set(null);
    this.deptMenuOpen.set(false);
    this.rulesMenuOpen.set(false);
    this.userMenuOpen.update((open) => !open);
  }

  openCart(): void {
    this.cartOpen.set(true);
  }

  closeCart(): void {
    this.cartOpen.set(false);
  }

  logOut(): void {
    this.userMenuOpen.set(false);
    this.authService.logout();
    this.router.navigateByUrl('/');
  }
}
