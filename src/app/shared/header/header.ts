import { CurrencyPipe, DatePipe, NgOptimizedImage, NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService, EmployeeLocation } from '../../core/auth/auth';
import {
  CartItem,
  CartService,
  PayTag,
  formatBalanceAmount,
  formatCartItemOptions,
  tileBalance,
} from '../../core/cart/cart';
import { CatalogCategory, CatalogMenu, CatalogViewService } from '../../core/catalog/catalog-view';
import { LocationSelectionService } from '../../core/location/location-selection';
import { TenantSettings, TenantSettingsService } from '../../core/tenant/tenant-settings';
import { AllotmentRuleCard } from '../allotment/rule-card';
import { PayTagBadge } from '../allotment/pay-tag';
import { ConfirmService } from '../confirm/confirm';
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

// A catalog whose whole top level collapses into one section (e.g.
// "Clothing" -> just "Apparel", with everything else nested underneath it)
// would otherwise render as a single, very tall column instead of spreading
// across the grid — unwrap a lone section into its own children (repeating
// as long as there's still only one) so the grid actually has more than one
// section to lay out side by side. The section's own label is dropped in
// the process; the nav button above the menu (e.g. "Clothing") already
// names the bucket, so nothing meaningful is lost.
function widenSingleSection(categories: readonly DisplayCategory[]): readonly DisplayCategory[] {
  let current = categories;
  while (current.length === 1 && current[0].children.length > 0) {
    current = current[0].children;
  }
  // Only worth it once there's actually more than one section to spread
  // across the grid — a chain that bottoms out at another lone section (or
  // a leaf) gains nothing by trading the original, more descriptive label
  // (e.g. "Footwear") for an equally-lonely descendant's (e.g. "Boot").
  return current.length > 1 ? current : categories;
}

@Component({
  selector: 'app-header',
  imports: [
    RouterLink,
    CurrencyPipe,
    DatePipe,
    NgOptimizedImage,
    ReactiveFormsModule,
    NgTemplateOutlet,
    AllotmentRuleCard,
    PayTagBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.html',
  styleUrls: ['../shared.css', './header.css'],
  host: {
    '(document:keydown.escape)': 'closeCatalogNav()',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class Header implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly confirmService = inject(ConfirmService);
  private readonly catalogViewService = inject(CatalogViewService);
  private readonly locationSelectionService = inject(LocationSelectionService);
  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly clearCatalogNavCloseTimeoutOnDestroy = inject(DestroyRef).onDestroy(() => {
    this.cancelScheduledCatalogNavOpen();
    this.cancelScheduledCatalogNavClose();
    this.cancelScheduledCartDialogClose();
    if (this.isBrowser) {
      document.body.style.overflow = '';
    }
  });

  @ViewChild('cartDialogEl') private readonly cartDialogEl?: ElementRef<HTMLDialogElement>;
  @ViewChild('deptWrap') private readonly deptWrapRef?: ElementRef<HTMLElement>;
  @ViewChild('rulesWrap') private readonly rulesWrapRef?: ElementRef<HTMLElement>;
  @ViewChild('userWrap') private readonly userWrapRef?: ElementRef<HTMLElement>;

  // Backstop for the drawer's own explicit close-on-navigate links below —
  // those only cover links *inside* the drawer; this catches everything
  // else (the logo, a department link, browser back/forward) so the
  // drawer never gets left open over whatever page comes next.
  private readonly closeCartOnAnyNavigation = this.router.events
    .pipe(
      filter((event): event is NavigationStart => event instanceof NavigationStart),
      takeUntilDestroyed(),
    )
    .subscribe(() => this.closeCart());

  // Matches Bootstrap's own `--bs-offcanvas-transition` duration — long
  // enough for the slide-out to finish before the dialog actually closes.
  private static readonly CART_DRAWER_CLOSE_TRANSITION_MS = 300;
  private closeCartDialogTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Opens/closes the native <dialog> to track `cartOpen()` — a plain
  // effect() only guarantees running after change detection, not after the
  // <dialog> has actually been created/updated in the DOM, so this uses
  // afterRenderEffect like the rest of the app's own DOM-imperative reads/
  // writes (see ConfirmDialog for the same pattern). showModal() gives a
  // real focus trap, Escape-to-close, and focus restored to whatever
  // opened it — none of which the previous plain <aside> ever had, despite
  // claiming `aria-modal="true"`.
  //
  // Closing is deliberately NOT instant: setting `open` to false snaps the
  // dialog to `display: none` immediately (a native UA rule our own CSS
  // doesn't override), which would cut Bootstrap's slide-out transition off
  // mid-animation. `[class.show]` already reacts to `cartOpen()` the moment
  // it flips, so the slide-out itself starts right away regardless — this
  // just delays the actual `close()` call until that animation has had
  // time to finish. (Escape is the one exception: the browser closes the
  // dialog natively and instantly on its own before this ever runs.)
  private readonly syncCartDialogOpenState = afterRenderEffect(() => {
    const dialog = this.cartDialogEl?.nativeElement;
    // jsdom (used in tests) doesn't implement showModal()/close() at all —
    // in a real browser this drives the native modal; in tests the dialog
    // just never actually opens, and the drawer's own open/close signal is
    // exercised directly instead.
    if (!dialog || typeof dialog.showModal !== 'function') {
      return;
    }
    if (this.cartOpen()) {
      this.cancelScheduledCartDialogClose();
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open && this.closeCartDialogTimeoutId === null) {
      this.closeCartDialogTimeoutId = setTimeout(() => {
        this.closeCartDialogTimeoutId = null;
        dialog.close();
      }, Header.CART_DRAWER_CLOSE_TRANSITION_MS);
    }
  });

  // showModal() only covers the dialog itself in the top layer — it
  // doesn't stop the page behind it from scrolling, so without this the
  // body's own scrollbar keeps running right alongside the drawer's own
  // item-list scrollbar. Locked/restored on the body directly since a
  // component's own scoped styles can never reach `<body>` (it's outside
  // this component's template, so Angular's emulated encapsulation
  // attribute never lands on it).
  private readonly lockBodyScrollWhileCartOpen = afterRenderEffect(() => {
    if (this.isBrowser) {
      document.body.style.overflow = this.cartOpen() ? 'hidden' : '';
    }
  });

  private cancelScheduledCartDialogClose(): void {
    if (this.closeCartDialogTimeoutId !== null) {
      clearTimeout(this.closeCartDialogTimeoutId);
      this.closeCartDialogTimeoutId = null;
    }
  }

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

  // The cart's own contents aren't location-scoped, so this loads
  // immediately even before a location is known (unlike the catalog menu
  // above) — but the allotment breakdown that comes back with it *is*, so
  // it still needs to reload once `activeLocation` settles or changes.
  private readonly loadCartOnLocationChange = effect(() => {
    const locationId = this.activeLocation()?.locationId ?? null;
    if (!this.isBrowser) {
      return;
    }
    // Fire-and-forget: a failed fetch just leaves the badge/drawer showing
    // whatever the shared `cart` signal already had (typically the still-
    // empty initial value) rather than anywhere in the header surfacing an
    // error of its own — an explicit error handler here just keeps that
    // failure from going fully unhandled.
    this.cartService.load(locationId).subscribe({ error: () => {} });
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
      const categories = widenSingleSection(buildDisplayCategories(menu[item.key]));
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
  // A short delay before actually opening on hover, so sweeping the mouse
  // across the nav bar toward something else (e.g. the search box) doesn't
  // flash every menu it passes over.
  private static readonly CATALOG_NAV_OPEN_DELAY_MS = 150;
  private openCatalogNavTimeoutId: ReturnType<typeof setTimeout> | null = null;
  readonly deptMenuOpen = signal(false);
  // Shared via `CartService` (like `cartOpen` below) so a page like product
  // detail can expand this same panel — e.g. its "View rule" link — without
  // reaching into the header component itself.
  readonly rulesMenuOpen = this.cartService.rulesMenuOpen;
  readonly userMenuOpen = signal(false);

  // `(ngSubmit)` is an output of `FormGroupDirective` (via `[formGroup]`) —
  // without wrapping the control in a group, a bare `<form>` has no
  // directive providing it, so the browser falls back to a native submit
  // (full page reload) instead of calling `search()`.
  readonly searchForm = new FormGroup({
    term: new FormControl('', { nonNullable: true }),
  });

  readonly cart = this.cartService.cart;
  readonly pointsOnly = this.cartService.pointsOnly;
  readonly cartCount = computed(() => this.cart().itemCount);
  // Switching locations re-scopes the allotment breakdown (and the catalog
  // itself) to a different program — with items already in the cart, that'd
  // leave them covered (or not) by rules that were never actually checked
  // against, so switching is blocked until the cart's empty again.
  readonly cartBlocksLocationChange = computed(() => this.cartCount() > 0);
  readonly cartSubtotal = computed(() => this.cart().subtotalPrice);
  readonly cartRemovingSkuId = signal<number | null>(null);
  readonly cartOpen = this.cartService.drawerOpen;

  readonly allotment = computed(() => this.cart().allotment);
  // `null` here means "no dollar rule" (units/points only, or none at all)
  // — the bar itself hides, but the Rules link/panel stays if there's at
  // least one rule to show. When every rule pays in points, `pointsBarRule`
  // below picks up the slack so the top summary still shows.
  readonly allotmentBar = computed(() => this.allotment()?.allotmentBar ?? null);
  readonly ruleCount = computed(() => this.allotment()?.ruleCount ?? 0);
  readonly allotmentRules = computed(() => this.allotment()?.rules ?? []);
  // The bar itself carries no renewal date — that lives on whichever rule
  // is flagged as the bar rule, matched by `allotmentBar.ruleId`.
  readonly allotmentBarRenewsOn = computed(() => {
    const bar = this.allotmentBar();
    if (!bar) {
      return null;
    }
    return this.allotmentRules().find((rule) => rule.ruleId === bar.ruleId)?.cycle.renewsOn ?? null;
  });
  // `allotmentBar` is dollar-only, so an employee with no dollar rule at
  // all (points, units, or a mix of the two — never gets one from the API.
  // Synthesize the same top summary locally from whichever rule is flagged
  // as the bar rule (falling back to the first rule) instead of hiding it
  // entirely whenever there's at least one rule to summarize.
  readonly nonDollarBarRule = computed(() => {
    const rules = this.allotmentRules();
    if (this.allotmentBar() || rules.length === 0) {
      return null;
    }
    return rules.find((rule) => rule.isBarRule === 'Y') ?? rules[0];
  });
  readonly nonDollarBarBalance = computed(() => {
    const rule = this.nonDollarBarRule();
    return rule ? tileBalance(rule) : null;
  });

  lineTag(cartItemId: number): PayTag | null {
    return this.allotment()?.lineTags.find((tag) => tag.cartItemId === cartItemId) ?? null;
  }

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
    this.cancelScheduledCatalogNavOpen();
    this.cancelScheduledCatalogNavClose();
    this.deptMenuOpen.set(false);
    this.rulesMenuOpen.set(false);
    this.userMenuOpen.set(false);
    this.openCatalogNavKey.update((open) => (open === key ? null : key));
  }

  openCatalogNavOnHover(key: CatalogNavLabel['key']): void {
    this.cancelScheduledCatalogNavClose();
    if (this.openCatalogNavKey() === key) {
      return;
    }
    this.cancelScheduledCatalogNavOpen();
    this.openCatalogNavTimeoutId = setTimeout(() => {
      this.deptMenuOpen.set(false);
      this.rulesMenuOpen.set(false);
      this.userMenuOpen.set(false);
      this.openCatalogNavKey.set(key);
    }, Header.CATALOG_NAV_OPEN_DELAY_MS);
  }

  scheduleCatalogNavClose(): void {
    this.cancelScheduledCatalogNavOpen();
    this.cancelScheduledCatalogNavClose();
    this.closeCatalogNavTimeoutId = setTimeout(() => this.openCatalogNavKey.set(null), 200);
  }

  cancelScheduledCatalogNavOpen(): void {
    if (this.openCatalogNavTimeoutId !== null) {
      clearTimeout(this.openCatalogNavTimeoutId);
      this.openCatalogNavTimeoutId = null;
    }
  }

  cancelScheduledCatalogNavClose(): void {
    if (this.closeCatalogNavTimeoutId !== null) {
      clearTimeout(this.closeCatalogNavTimeoutId);
      this.closeCatalogNavTimeoutId = null;
    }
  }

  closeCatalogNav(): void {
    this.cancelScheduledCatalogNavOpen();
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
    if (this.cartBlocksLocationChange()) {
      return;
    }
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

  // Closes whichever of the three dropdowns is open on any click outside
  // its own trigger+panel wrapper — a click on the trigger itself is
  // "inside" (it's part of the same wrapper), and is left to that button's
  // own (click) handler instead of being double-toggled here.
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.deptMenuOpen() && !this.deptWrapRef?.nativeElement.contains(target)) {
      this.deptMenuOpen.set(false);
    }
    if (this.rulesMenuOpen() && !this.rulesWrapRef?.nativeElement.contains(target)) {
      this.rulesMenuOpen.set(false);
    }
    if (this.userMenuOpen() && !this.userWrapRef?.nativeElement.contains(target)) {
      this.userMenuOpen.set(false);
    }
  }

  openCart(): void {
    this.cartService.openDrawer();
  }

  closeCart(): void {
    this.cartService.closeDrawer();
  }

  // Fires for a close the browser triggered itself (Escape, most notably)
  // rather than one of this drawer's own buttons/links — those already
  // clear `cartOpen()` before this can fire, making it a no-op then.
  onCartDialogNativeClose(): void {
    if (this.cartOpen()) {
      this.closeCart();
    }
  }

  // The standard "click the backdrop to dismiss" trick for <dialog>: a
  // click lands on the dialog element itself only when it hits the
  // backdrop area, since the real content always has some element in
  // between.
  onCartDialogBackdropClick(event: MouseEvent): void {
    if (event.target === this.cartDialogEl?.nativeElement) {
      this.closeCart();
    }
  }

  goToCart(): void {
    if (this.cart().items.length === 0) {
      return;
    }
    this.closeCart();
    this.router.navigateByUrl('/cart');
  }

  readonly cartItemOptionsLabel = formatCartItemOptions;
  readonly formatAmount = formatBalanceAmount;

  removeCartItem(item: CartItem): void {
    this.confirmService
      .ask({
        title: 'Remove item',
        message: `Remove ${item.productTitle} from your cart?`,
        confirmLabel: 'Remove',
        danger: true,
      })
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.cartRemovingSkuId.set(item.skuId);
        const locationId = this.activeLocation()?.locationId ?? null;
        this.cartService.removeItem(item.skuId, locationId).subscribe({
          // Both branches just clear the in-flight flag — the cart signal
          // itself is already updated by the service on success, and
          // there's nowhere in this drawer to surface a remove failure
          // beyond that.
          next: () => this.cartRemovingSkuId.set(null),
          error: () => this.cartRemovingSkuId.set(null),
        });
      });
  }

  logOut(): void {
    this.userMenuOpen.set(false);
    this.authService.logout();
    this.router.navigateByUrl('/');
  }
}
