import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { CartService, PayTag, ruleForCategories } from '../../../core/cart/cart';
import { Breadcrumb, hasCrumbs } from '../../../core/catalog/breadcrumb';
import {
  CatalogProductsService,
  OptionFacetGroup,
  Product,
  ProductSearchParams,
} from '../../../core/catalog/catalog-products';
import {
  CatalogCategory,
  CatalogViewService,
  allCategoryRoots,
  findCategoryPath,
} from '../../../core/catalog/catalog-view';
import { LocationSelectionService } from '../../../core/location/location-selection';
import { BreadcrumbNav } from '../../../shared/breadcrumb/breadcrumb-nav';
import { CategoryTree } from '../../../shared/catalog/category-tree/category-tree';
import { PayTagBadge } from '../../../shared/allotment/pay-tag';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

// The pill row under the breadcrumb (e.g. "All Uniform | Long Sleeve |
// Short Sleeve") — see `siblingPills` for how `source`/`activeId` are
// chosen.
export interface SiblingPills {
  parentId: number;
  parentLabel: string;
  items: CatalogCategory[];
  activeId: number;
}

const PAGE_SIZE = 24;
const BUCKET_SLUGS = new Set(['clothing', 'footwear', 'gear']);

// Color and Size are the options shoppers look for first — Color ahead of
// Size specifically — regardless of where the backend places them among
// the other option groups (Fit, Body, ...). Whichever of the two is
// actually present moves to the front in this order; anything else keeps
// its given relative order after them.
const OPTION_GROUP_PRIORITY = ['color', 'size'];

function sortOptionGroupsByPriority(groups: readonly OptionFacetGroup[]): OptionFacetGroup[] {
  const remaining = [...groups];
  const prioritized: OptionFacetGroup[] = [];
  for (const name of OPTION_GROUP_PRIORITY) {
    // Trimmed/case-insensitive exact match — an option literally called
    // "Size", not "Product Size" or "Body/Sleeve" (this backend can return
    // several other size-dimension groups alongside the canonical one).
    const index = remaining.findIndex(
      (group) => group.optionName.trim().toLowerCase() === name,
    );
    if (index !== -1) {
      prioritized.push(...remaining.splice(index, 1));
    }
  }
  return [...prioritized, ...remaining];
}

type CatalogScope =
  | { kind: 'category'; categoryId: number }
  | { kind: 'bucket'; bucket: string }
  | { kind: 'search'; search: string }
  | { kind: 'all' };

@Component({
  selector: 'app-product-list',
  imports: [Header, Footer, RouterLink, CurrencyPipe, BreadcrumbNav, PayTagBadge, CategoryTree],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-list.html',
  styleUrls: ['../../../shared/shared.css', './product-list.css'],
})
export class ProductList {
  private readonly catalogProductsService = inject(CatalogProductsService);
  private readonly catalogViewService = inject(CatalogViewService);
  private readonly locationSelectionService = inject(LocationSelectionService);
  private readonly cartService = inject(CartService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // An employee whose allotment is points-only never pays in dollars — the
  // card shows `pointsRange` instead of `priceRange` for them.
  readonly pointsOnly = this.cartService.pointsOnly;
  private readonly allotmentRules = computed(() => this.cartService.cart().allotment?.rules ?? []);

  @ViewChild('resultsTop') private readonly resultsTop?: ElementRef<HTMLElement>;

  // Bound from the route: `categoryId` is the path param (a real category
  // id, one of the bucket slugs like "footwear", or "full-catalog"), `name`
  // the `?name=` query param the nav links pass along, and `q` the `?q=`
  // query param the header search box passes along instead.
  readonly categoryId = input('');
  readonly name = input('');
  readonly q = input('');

  readonly pageTitle = computed(() =>
    this.q() ? `Search results for "${this.q()}"` : this.name() || 'Category',
  );

  // Carried onto each product card's link back to the grid (via product
  // detail's own "back" breadcrumb) — only meaningful when the route's
  // categoryId is itself a real numeric category id (not a bucket slug or
  // "full-catalog").
  readonly activeCategoryId = computed(() => {
    const parsed = Number(this.categoryId());
    return Number.isFinite(parsed) && this.categoryId() ? parsed : null;
  });

  // The raw menu for the sidebar tree — shown on every page regardless of
  // the current scope/search, independent of `*PRODUCT_LIST`/
  // `*PRODUCT_FACETS`. `CategoryTree` builds its own three bucket-level
  // roots from this, matching the header's own mega-menu tabs.
  readonly menu = this.catalogViewService.menu;

  // Every real category across every bucket, flattened — used for sibling-
  // pill lookups below (buckets themselves don't participate in that).
  readonly categoryRoots = computed(() => {
    const menu = this.menu();
    return menu ? allCategoryRoots(menu) : [];
  });

  // The route's own bucket slug (e.g. "footwear") when that bucket itself
  // is the whole scope — `null` for a specific category, search, or the
  // full catalog.
  readonly activeBucketSlug = computed(() => {
    const categoryId = this.categoryId();
    return BUCKET_SLUGS.has(categoryId) ? categoryId : null;
  });

  // "All {parent}" plus its direct children, e.g. "All Uniform | Long
  // Sleeve | Short Sleeve" — sourced from the active category's own
  // children when it has any (browsing a parent directly), otherwise from
  // its immediate parent's children (browsing one specific leaf). `null`
  // when there's no category in scope at all (bucket/search/full-catalog),
  // or the active category has neither children nor a parent to borrow
  // siblings from.
  readonly siblingPills = computed<SiblingPills | null>(() => {
    const activeId = this.activeCategoryId();
    if (activeId === null) {
      return null;
    }
    const path = findCategoryPath(this.categoryRoots(), activeId);
    if (!path) {
      return null;
    }
    const node = path[path.length - 1];
    const parent = path.length >= 2 ? path[path.length - 2] : null;
    const source = node.children.length > 0 ? node : parent;
    if (!source || source.children.length === 0) {
      return null;
    }
    return {
      parentId: source.progCatId,
      parentLabel: source.categoryName,
      items: source.children,
      activeId: source === node ? source.progCatId : node.progCatId,
    };
  });

  private readonly scope = computed<CatalogScope>(() => {
    const categoryId = this.categoryId();
    if (categoryId) {
      if (categoryId === 'full-catalog') {
        return { kind: 'all' };
      }
      if (BUCKET_SLUGS.has(categoryId)) {
        return { kind: 'bucket', bucket: categoryId.toUpperCase() };
      }
      const parsed = Number(categoryId);
      return Number.isFinite(parsed) ? { kind: 'category', categoryId: parsed } : { kind: 'all' };
    }
    const search = this.q();
    return search ? { kind: 'search', search } : { kind: 'all' };
  });

  readonly page = signal(1);
  // Keyed by `optionName` (e.g. "Size", "Color") — never a hardcoded set of
  // keys, since the backend decides what option groups a given category or
  // search actually has.
  readonly selectedOptions = signal<Partial<Record<string, string[]>>>({});

  readonly products = signal<Product[]>([]);
  readonly totalCount = signal(0);
  // Only ever present for a real `categoryId` scope — `null` for a bucket
  // page, search, or the full catalog, same as the API itself only returns
  // one when `categoryId` was sent.
  readonly breadcrumb = signal<Breadcrumb | null>(null);
  readonly hasBreadcrumb = computed(() => hasCrumbs(this.breadcrumb()));
  // Sorted with "Size" first (see `sizeFirst`) whenever it's (re)populated.
  readonly optionFacets = signal<OptionFacetGroup[]>([]);
  // Which option groups are collapsed, by `optionName` — reset every time
  // `optionFacets` itself refreshes, so it's always "first group open, rest
  // closed" for a freshly (re)loaded set of groups, while still letting the
  // user freely expand/collapse any of them afterward.
  readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());
  // Gates the grid only — `*PRODUCT_LIST` and `*PRODUCT_FACETS` are now
  // separate calls so the grid can render as soon as its own call resolves,
  // without waiting on the sidebar (see the integration guide's call
  // patterns). The sidebar has its own `facetsLoading` below.
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  // Only true while a facets re-fetch is actually in flight — a bare page
  // change never sets this, since facets don't depend on `page`.
  readonly facetsLoading = signal(false);

  readonly pageSize = PAGE_SIZE;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize)));

  // Lets the "Refine" box disappear entirely (rather than sit empty) when
  // this scope has no option facets to narrow by at all — the category
  // tree above it always shows regardless.
  readonly hasFacets = computed(() => this.optionFacets().length > 0);

  // Every selected (optionName, value) pair, flattened for the "Applied:"
  // chip row above the grid — each chip's own remove button just toggles
  // that one value back off via `toggleOption`.
  readonly appliedFilterChips = computed(() => {
    const chips: { optionName: string; value: string }[] = [];
    for (const [optionName, values] of Object.entries(this.selectedOptions())) {
      for (const value of values ?? []) {
        chips.push({ optionName, value });
      }
    }
    return chips;
  });
  readonly hasActiveFilters = computed(() => this.appliedFilterChips().length > 0);

  // A new category/search/bucket always starts back at page 1 with no
  // filters selected — only reacts to the route-bound inputs, not the
  // filter/page signals themselves (those reset the page right where they
  // change it, without touching each other).
  private readonly resetOnRouteChange = effect(() => {
    this.categoryId();
    this.q();
    this.page.set(1);
    this.selectedOptions.set({});
  });

  // The sidebar category tree's own data — same `*MENU` the header's mega
  // menu uses, cached per location by `CatalogViewService`, so this is a
  // no-op whenever the header's already loaded it for this location.
  private readonly loadMenuOnLocationChange = effect(() => {
    const location = this.locationSelectionService.activeLocation();
    if (location && this.isBrowser) {
      this.catalogViewService.load(location.locationId).subscribe();
    }
  });

  // Bumped on every new request of each kind — a response is only applied if
  // it's still the latest one of its kind by the time it arrives, so a slow
  // response to an old scope/filter/page can't clobber a newer one that
  // happened to resolve first (see the integration guide's "drop stale
  // responses" guidance).
  private listRequestId = 0;
  private facetsRequestId = 0;
  // The scope+filters key the sidebar facets were last fetched for — a bare
  // page change doesn't touch this, so it never re-triggers a facets fetch.
  private lastFacetsKey: string | null = null;

  private readonly loadProductsOnQueryChange = effect(() => {
    const scope = this.scope();
    const optionFilters = this.selectedOptions();
    const page = this.page();
    const location = this.locationSelectionService.activeLocation();

    if (!location || !this.isBrowser) {
      return;
    }

    const params: ProductSearchParams = {
      locationId: location.locationId,
      ...(scope.kind === 'category' ? { categoryId: scope.categoryId } : {}),
      ...(scope.kind === 'bucket' ? { bucket: scope.bucket } : {}),
      ...(scope.kind === 'search' ? { search: scope.search } : {}),
      optionFilters,
      page,
      pageSize: this.pageSize,
    };

    this.loadProductList(params);

    const facetsKey = JSON.stringify({ scope, optionFilters });
    if (facetsKey !== this.lastFacetsKey) {
      this.lastFacetsKey = facetsKey;
      this.loadFacets(params);
    }
  });

  private loadProductList(params: ProductSearchParams): void {
    const requestId = ++this.listRequestId;
    this.loading.set(true);
    this.error.set(null);
    this.catalogProductsService.searchList(params).subscribe({
      next: (result) => {
        if (requestId !== this.listRequestId) {
          return;
        }
        this.products.set(result.products);
        this.totalCount.set(result.totalCount);
        this.breadcrumb.set(result.breadcrumb);
        this.loading.set(false);
      },
      error: () => {
        if (requestId !== this.listRequestId) {
          return;
        }
        this.loading.set(false);
        this.error.set('We could not load products right now. Please try again.');
      },
    });
  }

  private loadFacets(params: ProductSearchParams): void {
    const requestId = ++this.facetsRequestId;
    const hasActiveOptionFilters = Object.values(params.optionFilters ?? {}).some(
      (values) => (values?.length ?? 0) > 0,
    );
    this.facetsLoading.set(true);
    this.catalogProductsService.searchFacets(params).subscribe({
      next: (result) => {
        if (requestId !== this.facetsRequestId) {
          return;
        }
        // Only refresh the option facet groups themselves from an
        // unfiltered response — once a value is selected, the backend
        // narrows (and sometimes reorders/drops) facets to match, which
        // made the sidebar visibly shuffle around right as someone used
        // it. Freeze it at whatever it looked like before any filter was
        // applied; `resetOnRouteChange` clears selections (and so re-arms
        // this) whenever the category/search scope itself changes.
        if (!hasActiveOptionFilters) {
          const sorted = sortOptionGroupsByPriority(result.optionFacets);
          this.optionFacets.set(sorted);
          this.collapsedGroups.set(new Set(sorted.slice(1).map((group) => group.optionName)));
        }
        this.facetsLoading.set(false);
      },
      // A facets failure shouldn't blank the grid — leave the sidebar
      // showing whatever it last had (or its loading skeleton clears and
      // `hasFacets` decides whether to show anything at all).
      error: () => {
        if (requestId !== this.facetsRequestId) {
          return;
        }
        this.facetsLoading.set(false);
      },
    });
  }

  // Ranks two category-*specific* allotment rules against each other by how
  // deep their matching category sits in the catalog tree — e.g. a rule
  // scoped to "Trousers" outranks one only reaching this product through
  // the broader "Outerwear" ancestor. See `ruleForCategories`.
  private readonly categoryDepth = computed(() => {
    const roots = this.categoryRoots();
    return (progCatId: number) => findCategoryPath(roots, progCatId)?.length ?? null;
  });

  // A preview, not the authoritative tag — matches the product's own
  // program categories against the active allotment's rules, same as the
  // cart's own `lineTags` would once it's actually added. `null` when
  // nothing covers it (or there's no allotment at all).
  coverageTag(product: Product): PayTag | null {
    const rule = ruleForCategories(this.allotmentRules(), product.progCatIds, this.categoryDepth());
    return rule ? { ruleId: rule.ruleId, payUnit: rule.primaryUnit, tagLabel: rule.ruleName } : null;
  }

  toggleGroupCollapsed(optionName: string): void {
    this.collapsedGroups.update((current) => {
      const next = new Set(current);
      if (next.has(optionName)) {
        next.delete(optionName);
      } else {
        next.add(optionName);
      }
      return next;
    });
  }

  clearOptionFilter(optionName: string): void {
    this.selectedOptions.update((current) => ({ ...current, [optionName]: [] }));
    this.page.set(1);
    this.scrollResultsIntoView();
  }

  clearAllOptionFilters(): void {
    this.selectedOptions.set({});
    this.page.set(1);
    this.scrollResultsIntoView();
  }

  toggleOption(optionName: string, value: string): void {
    this.selectedOptions.update((current) => {
      const values = current[optionName] ?? [];
      const updatedValues = values.includes(value)
        ? values.filter((selected) => selected !== value)
        : [...values, value];
      return { ...current, [optionName]: updatedValues };
    });
    this.page.set(1);
    this.scrollResultsIntoView();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) {
      return;
    }
    this.page.set(page);
    this.scrollResultsIntoView();
  }

  // Jumps back to the top of the results immediately (not waiting on the
  // newly-filtered/paged data to arrive) — otherwise the new results load in
  // wherever the user happened to be scrolled to, e.g. the pagination
  // controls at the very bottom or a size/color chip further down the
  // sidebar. Guarded by a feature check (rather than just `isBrowser`)
  // since jsdom, used in tests, doesn't implement `scrollIntoView` at all.
  private scrollResultsIntoView(behavior: ScrollBehavior = 'smooth'): void {
    const target = this.resultsTop?.nativeElement;
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior, block: 'start' });
    }
  }
}
