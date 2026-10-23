import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, of, shareReplay, tap } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface CatalogCategory {
  progCatId: number;
  parentProgCatId: number | null;
  categoryName: string;
  sortOrder: number;
  status: string;
  children: CatalogCategory[];
  // Only ever populated by the API on a leaf (no `children`) — a parent
  // node's own count is always 0 here; use `categoryProductCount` below to
  // get its rollup total across every leaf descendant.
  productCount: number;
}

interface RawCatalogCategory extends Omit<CatalogCategory, 'children' | 'productCount'> {
  children: RawCatalogCategory[] | null;
  productCount: number | null | undefined;
}

export interface CatalogMenu {
  clothing: CatalogCategory[];
  footwear: CatalogCategory[];
  gear: CatalogCategory[];
}

interface RawCatalogMenu {
  clothing: RawCatalogCategory[] | null;
  footwear: RawCatalogCategory[] | null;
  gear: RawCatalogCategory[] | null;
}

export interface CatalogView {
  viewId: number;
  programId: number;
  menu: CatalogMenu;
  categoryCount: number;
}

interface RawCatalogView extends Omit<CatalogView, 'menu'> {
  menu: RawCatalogMenu;
}

function normalizeCategory(category: RawCatalogCategory): CatalogCategory {
  return {
    ...category,
    children: (category.children ?? []).map(normalizeCategory),
    productCount: category.productCount ?? 0,
  };
}

function normalizeMenu(menu: RawCatalogMenu): CatalogMenu {
  return {
    clothing: (menu.clothing ?? []).map(normalizeCategory),
    footwear: (menu.footwear ?? []).map(normalizeCategory),
    gear: (menu.gear ?? []).map(normalizeCategory),
  };
}

// A parent's own `productCount` is never populated by the API — only a leaf
// (no children) carries a real count — so a parent's total is always the sum
// of every leaf underneath it, recursively.
export function categoryProductCount(category: CatalogCategory): number {
  if (category.children.length === 0) {
    return category.productCount;
  }
  return category.children.reduce((sum, child) => sum + categoryProductCount(child), 0);
}

// Pairs of names treated as "the same" for the redundant-wrapper collapse
// below, even though they're not literally identical strings — e.g. a bucket
// labeled "Clothing" whose own single top-level category is conventionally
// named "Apparel" instead of repeating "Clothing" exactly. Each pair matches
// in either direction (parent/child order doesn't matter). Add more pairs
// here as other known synonyms turn up.
const CATEGORY_NAME_SYNONYMS: ReadonlyArray<readonly [string, string]> = [['clothing', 'apparel']];

function namesAreEquivalent(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left === right) {
    return true;
  }
  return CATEGORY_NAME_SYNONYMS.some(
    ([x, y]) => (left === x && right === y) || (left === y && right === x),
  );
}

// A category whose one and only child has an equivalent name (exact match,
// case/whitespace insensitive, or a known synonym like "Clothing"/"Apparel"
// — see `namesAreEquivalent`) is a redundant wrapper — display-wise, that
// child's row adds nothing, so it's skipped and its own children are
// promoted to show directly under the parent instead. Runs through however
// many such layers chain together, and recurses into every remaining
// branch. The parent's own identity (`progCatId`/name) is kept — only the
// redundant child's row disappears, never the parent's.
export function collapseSameNameChild(category: CatalogCategory): CatalogCategory {
  let current = category;
  while (
    current.children.length === 1 &&
    namesAreEquivalent(current.categoryName, current.children[0].categoryName)
  ) {
    current = { ...current, children: current.children[0].children };
  }
  return { ...current, children: current.children.map(collapseSameNameChild) };
}

// Every root array in a `CatalogMenu` flattened into one list — the sidebar
// category tree shows the whole catalog (every bucket) at once, regardless
// of which bucket/category/search is currently being browsed.
export function allCategoryRoots(menu: CatalogMenu): CatalogCategory[] {
  return [...menu.clothing, ...menu.footwear, ...menu.gear];
}

// The path from a root down to `progCatId`, root first and the match last —
// `null` if it isn't in this tree at all. Used both to know which ancestors
// to auto-expand and to find a leaf's immediate parent for the sibling-pill
// row.
export function findCategoryPath(
  roots: readonly CatalogCategory[],
  progCatId: number,
): CatalogCategory[] | null {
  for (const category of roots) {
    if (category.progCatId === progCatId) {
      return [category];
    }
    const nested = findCategoryPath(category.children, progCatId);
    if (nested) {
      return [category, ...nested];
    }
  }
  return null;
}

// A case-insensitive substring match against the category tree, for the
// sidebar's "Find a category" box. A category whose own name matches keeps
// its *entire* subtree (so searching "Shirt" still shows every shirt
// sub-category); a category that only has a matching descendant keeps just
// the branches leading to that match, not its unrelated siblings.
export function filterCategoryTree(
  categories: readonly CatalogCategory[],
  query: string,
): CatalogCategory[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...categories];
  }
  return categories.flatMap((category): CatalogCategory[] => {
    if (category.categoryName.toLowerCase().includes(needle)) {
      return [category];
    }
    const matchingChildren = filterCategoryTree(category.children, needle);
    return matchingChildren.length > 0 ? [{ ...category, children: matchingChildren }] : [];
  });
}

// Every category id in the tree, for "Expand all" — collapsing is just
// clearing the expanded-ids set back to empty.
export function collectCategoryIds(categories: readonly CatalogCategory[]): number[] {
  return categories.flatMap((category) => [
    category.progCatId,
    ...collectCategoryIds(category.children),
  ]);
}

// A "leaf" category — one shoppable enough to feature on the Home page's
// "Shop by category" carousel, as opposed to the full parent/child tree
// `CatalogCategory` describes for the header's nav menu.
export interface LeafCategory {
  progCatId: number;
  categoryName: string;
  productCount: number;
  imageUrl: string;
}

export interface LeafCategoriesResponse {
  categories: LeafCategory[];
}

@Injectable({ providedIn: 'root' })
export class CatalogViewService {
  private readonly http = inject(HttpClient);
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCTPCVEW`;

  readonly menu = signal<CatalogMenu | null>(null);

  private cachedLocationId: number | null = null;
  private cachedView: CatalogView | null = null;
  private request$: Observable<CatalogView> | null = null;

  /**
   * Fetches a location's catalog menu once and caches it — the category
   * tree only changes when someone reassigns the location, not from one
   * page load to the next, so repeat calls for the SAME location (e.g. the
   * header remounting on every navigation) reuse the cached value or the
   * same in-flight request instead of re-hitting the API. Calling with a
   * different location invalidates the cache and fetches fresh.
   */
  load(locationId: number): Observable<CatalogView> {
    if (this.cachedLocationId !== locationId) {
      this.cachedLocationId = locationId;
      this.cachedView = null;
      this.request$ = null;
    }

    if (this.cachedView) {
      return of(this.cachedView);
    }

    if (!this.request$) {
      this.request$ = this.http
        .post<RawCatalogView>(this.dispatchUrl, { locationId, action: '*MENU' })
        .pipe(
          map((response) => ({ ...response, menu: normalizeMenu(response.menu) })),
          tap((response) => {
            this.cachedView = response;
            this.menu.set(response.menu);
          }),
          shareReplay(1),
        );
    }
    return this.request$;
  }

  readonly categories = signal<LeafCategory[]>([]);

  private cachedCategoriesLocationId: number | null = null;
  private cachedCategoriesResponse: LeafCategoriesResponse | null = null;
  private categoriesRequest$: Observable<LeafCategoriesResponse> | null = null;

  /**
   * Fetches a location's shoppable ("leaf") categories once and caches
   * them — same reasoning and cache-per-location shape as `load()` above,
   * just a separate cache since the two are independent datasets from the
   * same dispatcher.
   */
  loadCategories(locationId: number): Observable<LeafCategoriesResponse> {
    if (this.cachedCategoriesLocationId !== locationId) {
      this.cachedCategoriesLocationId = locationId;
      this.cachedCategoriesResponse = null;
      this.categoriesRequest$ = null;
    }

    if (this.cachedCategoriesResponse) {
      return of(this.cachedCategoriesResponse);
    }

    if (!this.categoriesRequest$) {
      this.categoriesRequest$ = this.http
        .post<LeafCategoriesResponse>(this.dispatchUrl, { locationId, action: '*CATEGORIES' })
        .pipe(
          // The live API sends `null` instead of `[]` for other empty array
          // fields on this same endpoint (see CatalogProductsService) —
          // normalize defensively here too.
          map((response) => ({ categories: response.categories ?? [] })),
          tap((response) => {
            this.cachedCategoriesResponse = response;
            this.categories.set(response.categories);
          }),
          shareReplay(1),
        );
    }
    return this.categoriesRequest$;
  }
}
