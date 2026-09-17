import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface ProductColor {
  valueDesc: string;
  valueCode: string;
}

export interface Product {
  productPk: number;
  productId: string;
  title: string;
  skuCode: string;
  price: number;
  imageUrl: string;
  colors: ProductColor[];
}

export interface CategoryFacet {
  progCatId: number;
  categoryName: string;
  count: number;
}

// `valueCode` is mainly for a "Color" group (hex-ish swatch codes) — an
// empty string means this option has no swatch, e.g. Size/Material.
export interface OptionFacetValue {
  value: string;
  valueCode: string;
  count: number;
}

// One product-option group (Size, Color, Material, Fit, ...). The backend
// decides what groups exist for a given category/search — never assume
// Size/Color are the only ones, or that they're always present.
export interface OptionFacetGroup {
  optionName: string;
  values: OptionFacetValue[];
}

export interface ProductSearchResult {
  products: Product[];
  totalCount: number;
  page: number;
  pageSize: number;
  categoryFacets: CategoryFacet[];
  optionFacets: OptionFacetGroup[];
}

export interface ProductSearchParams {
  locationId: number;
  // Mutually exclusive scopes — pass at most one. Omitting both searches
  // the full catalog.
  categoryId?: number;
  bucket?: string;
  search?: string;
  // Keyed by the exact `optionName` an `optionFacets` group came back
  // with (e.g. "Size", "Color") — build this from whatever the user
  // actually selected, never from a hardcoded set of names. Only groups
  // with at least one selected value end up in the request.
  optionFilters?: Partial<Record<string, string[]>>;
  page?: number;
  pageSize?: number;
}

// The backend wants one flat, delimited string rather than JSON:
// "Size:S,M;Color:Black" — groups separated by `;`, an option's name from
// its values by `:`, and multiple values within a group by `,`. Values
// within a group are OR'd; different groups are AND'd together. Groups
// with no selected values are dropped entirely, and no filters at all
// becomes '' (the caller then omits the field, matching "no filter").
function buildOptionFiltersString(
  optionFilters: Partial<Record<string, string[]>> | undefined,
): string {
  if (!optionFilters) {
    return '';
  }
  return Object.entries(optionFilters)
    .filter((entry): entry is [string, string[]] => !!entry[1]?.length)
    .map(([name, values]) => `${name}:${values.join(',')}`)
    .join(';');
}

// The live API sometimes sends `null` for an array field (e.g. a product
// with no color variants) instead of `[]` — normalize once here so nothing
// downstream has to defensively null-check every list.
function normalizeSearchResult(result: ProductSearchResult): ProductSearchResult {
  return {
    ...result,
    products: (result.products ?? []).map((product) => ({
      ...product,
      colors: product.colors ?? [],
    })),
    categoryFacets: result.categoryFacets ?? [],
    optionFacets: (result.optionFacets ?? []).map((group) => ({
      ...group,
      values: group.values ?? [],
    })),
  };
}

@Injectable({ providedIn: 'root' })
export class CatalogProductsService {
  private readonly http = inject(HttpClient);
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCTPCVEW`;

  search(params: ProductSearchParams): Observable<ProductSearchResult> {
    const { locationId, categoryId, bucket, search, optionFilters, page, pageSize } = params;
    const optionFiltersString = buildOptionFiltersString(optionFilters);
    return this.http
      .post<ProductSearchResult>(this.dispatchUrl, {
        action: '*PRODUCTS',
        locationId,
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(bucket !== undefined ? { bucket } : {}),
        ...(search ? { search } : {}),
        ...(optionFiltersString ? { optionFilters: optionFiltersString } : {}),
        ...(page !== undefined ? { page } : {}),
        ...(pageSize !== undefined ? { pageSize } : {}),
      })
      .pipe(map((result) => normalizeSearchResult(result)));
  }
}
