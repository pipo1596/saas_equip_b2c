import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Breadcrumb, RawBreadcrumb, normalizeBreadcrumb } from './breadcrumb';

export type { Breadcrumb, BreadcrumbCategory } from './breadcrumb';

export interface ProductColor {
  valueDesc: string;
  valueCode: string;
  // A CSS-renderable color (hex or a named color like "navy") to use as the
  // swatch's background. `valueSwtchImage`, when present, takes priority —
  // e.g. for a patterned/textured option a flat color can't represent.
  valueSwtchColor: string;
  valueSwtchImage: string;
}

// Low/high across the product's SKUs — `null` for both only if it somehow
// has no SKUs yet. Equal `min`/`max` means every SKU shares one value.
export interface PriceRange {
  min: number;
  max: number;
}

export interface PointsRange {
  min: number;
  max: number;
}

export interface Product {
  productPk: number;
  productId: string;
  title: string;
  skuCode: string;
  priceRange: PriceRange | null;
  pointsRange: PointsRange | null;
  imageUrl: string;
  colors: ProductColor[];
  // Every program category this product belongs to — matched against an
  // allotment rule's own `covers.categories` to show which rule (if any)
  // is likely to cover it, before it's actually in the cart.
  progCatIds: number[];
}

interface RawProduct extends Omit<Product, 'priceRange' | 'pointsRange' | 'colors' | 'progCatIds'> {
  priceRange: PriceRange | null | undefined;
  pointsRange: PointsRange | null | undefined;
  colors: ProductColor[] | null;
  progCatIds: number[] | null;
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

// `*PRODUCT_LIST` — the grid itself, re-fetched on every scope/search/filter/
// page change. Split from the facets so paging never waits on recomputing
// them (see `ProductFacetsResult`).
export interface ProductListResult {
  // Only present when `categoryId` was sent and it resolves to a real
  // category in this location's program — `null` for a bucket scope, the
  // unscoped full catalog, or a search, and also `null` if the lookup
  // itself just failed. Never blocks `products` from loading.
  breadcrumb: Breadcrumb | null;
  products: Product[];
  totalCount: number;
  page: number;
  pageSize: number;
}

interface RawProductListResult extends Omit<ProductListResult, 'breadcrumb' | 'products'> {
  breadcrumb: RawBreadcrumb | null;
  products: RawProduct[] | null;
}

// `*PRODUCT_FACETS` — the sidebar. Re-fetched only when scope/search/filters
// change, never on a bare page change (its counts don't depend on `page`).
export interface ProductFacetsResult {
  categoryFacets: CategoryFacet[];
  optionFacets: OptionFacetGroup[];
}

interface RawProductFacetsResult {
  categoryFacets: CategoryFacet[] | null;
  optionFacets: (Omit<OptionFacetGroup, 'values'> & { values: OptionFacetValue[] | null })[] | null;
}

// A failure is always `{ success: false, message }`; a success response
// never has a `success` key at all — discriminate on a field that's only
// ever present on success (`products`/`categoryFacets` below), matching the
// pattern already used for `*GET`/`*AVAIL`/`*GET_SKU` in `product-detail.ts`.
interface ApiFailure {
  success: false;
  message: string | null;
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
function normalizeProductListResult(result: RawProductListResult): ProductListResult {
  return {
    ...result,
    breadcrumb: normalizeBreadcrumb(result.breadcrumb),
    products: (result.products ?? []).map((product) => ({
      ...product,
      priceRange: product.priceRange ?? null,
      pointsRange: product.pointsRange ?? null,
      colors: (product.colors ?? []).map((color) => ({
        ...color,
        valueSwtchColor: color.valueSwtchColor ?? '',
        valueSwtchImage: color.valueSwtchImage ?? '',
      })),
      progCatIds: product.progCatIds ?? [],
    })),
  };
}

function normalizeFacetsResult(result: RawProductFacetsResult): ProductFacetsResult {
  return {
    categoryFacets: result.categoryFacets ?? [],
    optionFacets: (result.optionFacets ?? []).map((group) => ({
      ...group,
      values: group.values ?? [],
    })),
  };
}

// Both actions take identical request fields (see the integration guide) —
// built once here and sent twice with a different `action`.
function buildRequestBody(
  action: '*PRODUCT_LIST' | '*PRODUCT_FACETS',
  params: ProductSearchParams,
): Record<string, unknown> {
  const { locationId, categoryId, bucket, search, optionFilters, page, pageSize } = params;
  const optionFiltersString = buildOptionFiltersString(optionFilters);
  return {
    action,
    locationId,
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(bucket !== undefined ? { bucket } : {}),
    ...(search ? { search } : {}),
    ...(optionFiltersString ? { optionFilters: optionFiltersString } : {}),
    ...(page !== undefined ? { page } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
  };
}

@Injectable({ providedIn: 'root' })
export class CatalogProductsService {
  private readonly http = inject(HttpClient);
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCTPCVEW`;

  // The grid itself — call on every scope/search/filter/page change.
  searchList(params: ProductSearchParams): Observable<ProductListResult> {
    return this.http
      .post<RawProductListResult | ApiFailure>(
        this.dispatchUrl,
        buildRequestBody('*PRODUCT_LIST', params),
      )
      .pipe(
        map((response) => {
          if (!('products' in response)) {
            throw new Error(response.message ?? 'We could not load products right now.');
          }
          return normalizeProductListResult(response);
        }),
      );
  }

  // The sidebar — call on a scope/search/filter change, but skip on a bare
  // page change (its counts don't depend on `page`).
  searchFacets(params: ProductSearchParams): Observable<ProductFacetsResult> {
    return this.http
      .post<RawProductFacetsResult | ApiFailure>(
        this.dispatchUrl,
        buildRequestBody('*PRODUCT_FACETS', params),
      )
      .pipe(
        map((response) => {
          if (!('categoryFacets' in response)) {
            throw new Error(response.message ?? 'We could not load filters right now.');
          }
          return normalizeFacetsResult(response);
        }),
      );
  }
}
