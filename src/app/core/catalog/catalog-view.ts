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
}

export interface CatalogMenu {
  clothing: CatalogCategory[];
  footwear: CatalogCategory[];
  gear: CatalogCategory[];
}

export interface CatalogView {
  viewId: number;
  programId: number;
  menu: CatalogMenu;
  categoryCount: number;
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
        .post<CatalogView>(this.dispatchUrl, { locationId, action: '*MENU' })
        .pipe(
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
