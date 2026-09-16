import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

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

  load(locationId: number): Observable<CatalogView> {
    return this.http
      .post<CatalogView>(this.dispatchUrl, { locationId, action: '*MENU' })
      .pipe(tap((response) => this.menu.set(response.menu)));
  }
}
