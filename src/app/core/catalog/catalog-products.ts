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

export interface SizeFacet {
  value: string;
  count: number;
}

export interface ColorFacet {
  value: string;
  valueCode: string;
  count: number;
}

export interface ProductSearchResult {
  products: Product[];
  totalCount: number;
  page: number;
  pageSize: number;
  categoryFacets: CategoryFacet[];
  sizeFacets: SizeFacet[];
  colorFacets: ColorFacet[];
}

export interface ProductSearchParams {
  locationId: number;
  // Mutually exclusive scopes — pass at most one. Omitting both searches
  // the full catalog.
  categoryId?: number;
  bucket?: string;
  search?: string;
  sizes?: string[];
  colors?: string[];
  page?: number;
  pageSize?: number;
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
    sizeFacets: result.sizeFacets ?? [],
    colorFacets: result.colorFacets ?? [],
  };
}

@Injectable({ providedIn: 'root' })
export class CatalogProductsService {
  private readonly http = inject(HttpClient);
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCTPCVEW`;

  search(params: ProductSearchParams): Observable<ProductSearchResult> {
    const { locationId, categoryId, bucket, search, sizes, colors, page, pageSize } = params;
    return this.http
      .post<ProductSearchResult>(this.dispatchUrl, {
        action: '*PRODUCTS',
        locationId,
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(bucket !== undefined ? { bucket } : {}),
        ...(search ? { search } : {}),
        ...(sizes?.length ? { sizes } : {}),
        ...(colors?.length ? { colors } : {}),
        ...(page !== undefined ? { page } : {}),
        ...(pageSize !== undefined ? { pageSize } : {}),
      })
      .pipe(map((result) => normalizeSearchResult(result)));
  }
}
