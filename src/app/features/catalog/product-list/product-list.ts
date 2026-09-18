import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
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

import {
  CatalogProductsService,
  CategoryFacet,
  OptionFacetGroup,
  Product,
} from '../../../core/catalog/catalog-products';
import { CatalogViewService } from '../../../core/catalog/catalog-view';
import { LocationSelectionService } from '../../../core/location/location-selection';
import { Footer } from '../../../shared/footer/footer';
import { Header } from '../../../shared/header/header';

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
  imports: [Header, Footer, RouterLink, CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-list.html',
  styleUrls: ['../../../shared/shared.css', './product-list.css'],
})
export class ProductList implements AfterViewInit {
  private readonly catalogProductsService = inject(CatalogProductsService);
  private readonly catalogViewService = inject(CatalogViewService);
  private readonly locationSelectionService = inject(LocationSelectionService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly hostElementRef = inject(ElementRef<HTMLElement>);

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

  // Highlights the currently browsed category in the facet list — only
  // meaningful when the route's categoryId is itself a real numeric
  // category id (not a bucket slug or "full-catalog").
  readonly activeCategoryId = computed(() => {
    const parsed = Number(this.categoryId());
    return Number.isFinite(parsed) && this.categoryId() ? parsed : null;
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
  readonly categoryFacets = signal<CategoryFacet[]>([]);
  // Categories with zero matches in the current scope aren't worth showing
  // as a filter option at all, and this list should only ever offer the
  // shoppable "leaf" categories — never a parent/group node — so it's
  // cross-referenced against the same leaf-category set the Home page's
  // "Shop by category" carousel uses. Falls back to showing every facet
  // with a positive count while that leaf list is still loading, rather
  // than flashing an empty sidebar.
  readonly visibleCategoryFacets = computed(() => {
    const withCount = this.categoryFacets().filter((facet) => facet.count > 0);
    const leafCategories = this.catalogViewService.categories();
    if (leafCategories.length === 0) {
      return withCount;
    }
    const leafIds = new Set(leafCategories.map((category) => category.progCatId));
    return withCount.filter((facet) => leafIds.has(facet.progCatId));
  });
  // Sorted with "Size" first (see `sizeFirst`) whenever it's (re)populated.
  readonly optionFacets = signal<OptionFacetGroup[]>([]);
  // Which option groups are collapsed, by `optionName` — reset every time
  // `optionFacets` itself refreshes, so it's always "first group open, rest
  // closed" for a freshly (re)loaded set of groups, while still letting the
  // user freely expand/collapse any of them afterward.
  readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly pageSize = PAGE_SIZE;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize)));

  // Lets the sidebar column disappear entirely (rather than sit empty)
  // when this scope has no facets to narrow by at all.
  readonly hasFacets = computed(
    () => this.visibleCategoryFacets().length > 0 || this.optionFacets().length > 0,
  );

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

  // Same leaf-category load the Home page uses — kept here too since a
  // shopper can land directly on a product list without ever visiting Home.
  // `CatalogViewService` caches per location, so this is a no-op if it's
  // already loaded.
  private readonly loadLeafCategoriesOnLocationChange = effect(() => {
    const location = this.locationSelectionService.activeLocation();
    if (location && this.isBrowser) {
      this.catalogViewService.loadCategories(location.locationId).subscribe();
    }
  });

  private readonly loadProductsOnQueryChange = effect(() => {
    const scope = this.scope();
    const optionFilters = this.selectedOptions();
    const page = this.page();
    const location = this.locationSelectionService.activeLocation();

    if (!location || !this.isBrowser) {
      return;
    }

    const hasActiveOptionFilters = Object.values(optionFilters).some(
      (values) => (values?.length ?? 0) > 0,
    );

    this.loading.set(true);
    this.error.set(null);
    this.catalogProductsService
      .search({
        locationId: location.locationId,
        ...(scope.kind === 'category' ? { categoryId: scope.categoryId } : {}),
        ...(scope.kind === 'bucket' ? { bucket: scope.bucket } : {}),
        ...(scope.kind === 'search' ? { search: scope.search } : {}),
        optionFilters,
        page,
        pageSize: this.pageSize,
      })
      .subscribe({
        next: (result) => {
          this.products.set(result.products);
          this.totalCount.set(result.totalCount);
          this.categoryFacets.set(result.categoryFacets);
          // Only refresh the option facet groups themselves from an
          // unfiltered response — once a value is selected, the backend
          // narrows (and sometimes reorders/drops) facets to match, which
          // made the sidebar visibly shuffle around right as someone used
          // it. Freeze it at whatever it looked like before any filter was
          // applied; `resetOnRouteChange` clears selections (and so
          // re-arms this) whenever the category/search scope itself
          // changes. `categoryFacets` doesn't need the same treatment —
          // its counts are scope-only and unaffected by optionFilters.
          if (!hasActiveOptionFilters) {
            const sorted = sortOptionGroupsByPriority(result.optionFacets);
            this.optionFacets.set(sorted);
            this.collapsedGroups.set(
              new Set(sorted.slice(1).map((group) => group.optionName)),
            );
          }
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('We could not load products right now. Please try again.');
        },
      });
  });

  ngAfterViewInit(): void {
    // Landing on this route can otherwise leave the browser at whatever
    // scroll position the previous page was at (e.g. the router keeps
    // scroll position, or this is a fresh category coming from a link
    // further down the home page) — jump all the way to the top of the
    // page (above even the header, unlike `scrollResultsIntoView`'s
    // results-anchor used for later filter/page changes) on first render,
    // without the "smooth" animation used for those later changes. Guarded
    // the same way as `scrollResultsIntoView`, since jsdom (used in tests)
    // doesn't implement `scrollIntoView` at all.
    const target = this.hostElementRef.nativeElement;
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
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
