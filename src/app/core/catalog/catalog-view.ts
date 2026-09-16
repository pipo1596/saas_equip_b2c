import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, shareReplay, tap } from 'rxjs';

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
}
