import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Breadcrumb, RawBreadcrumb, normalizeBreadcrumb } from './breadcrumb';

export type { Breadcrumb, BreadcrumbCategory } from './breadcrumb';

export interface ProductDetailInfo {
  productPk: number;
  productId: string;
  handle: string;
  title: string;
  descr: string;
  longDescr: string;
  features: string;
  construction: string;
  vendor: string;
  brandId: number;
  brandName: string;
  // Empty when the product has no brand assigned, or `brandId` no longer
  // points at a real brand row — treat the same as absent.
  brandLogoUrl: string;
  productType: string;
  status: string;
  gender: string;
  published: string;
  giftCard: string;
  productCond: string;
  allowBackorder: string;
  tags: string;
  techSpec: string;
  techSpecImg: string;
  // Low/high base price across the product's SKUs — both `null` if it has
  // no SKUs yet. Equal when every SKU shares one price.
  minPrice: number | null;
  maxPrice: number | null;
}

// `skuId: null` is a product-level/gallery image; a populated `skuId` is
// specific to that variant. `optionIds` are the option value(s) (matching
// `ProductOptionValue.optId`) this specific photo represents — e.g. a
// Color axis's optId, for a per-color product shot.
export interface ProductImage {
  imageId: number;
  skuId: number | null;
  imageUrl: string;
  imageType: string;
  imageDesc: string;
  sortOrder: number;
  optionIds: number[];
}

// One value on one option axis (e.g. `optName: "Color"`, `valueDesc:
// "Black"`). `swatchColor`/`swatchImg` are mostly meaningful for a "Color"
// axis — empty on axes like Size that have no swatch.
export interface ProductOptionValue {
  optId: number;
  optName: string;
  optOrder: number;
  valueCode: string;
  valueDesc: string;
  swatchColor: string;
  swatchImg: string;
  valSeq: number;
}

// `options` comes back from the API as one flat list — every value of
// every axis mixed together — grouped here by `optName` into the shape the
// selector UI actually wants.
export interface ProductOptionAxis {
  optName: string;
  optOrder: number;
  values: ProductOptionValue[];
}

// A free-form product spec (e.g. `attrName: "Material"`, `attrValue: "100%
// Cotton"`) — distinct from the option axes above, which drive the SKU
// selector rather than just being displayed.
export interface ProductAttribute {
  attrId: number;
  attrName: string;
  attrValue: string;
}

export interface ProductDetailData {
  product: ProductDetailInfo;
  images: ProductImage[];
  axes: ProductOptionAxis[];
  attributes: ProductAttribute[];
  // `null` when no locationId was sent, the location has no view, or the
  // lookup otherwise failed — never blocks the rest of the page from
  // loading, just means there's nothing to show for it.
  breadcrumb: Breadcrumb | null;
}

interface RawProductDetailData {
  product: ProductDetailInfo;
  images: ProductImage[] | null;
  options: ProductOptionValue[] | null;
  attributes: ProductAttribute[] | null;
  breadcrumb: RawBreadcrumb | null;
}

// One axis's worth of availability given everything picked on the *other*
// axes. `availableOptIds` is what's still worth showing enabled — an empty
// array means nothing on that axis is compatible right now; disable it,
// don't hide it.
export interface ProductAvailabilityAxis {
  optName: string;
  optOrder: number;
  availableOptIds: number[];
}

export interface ProductAvailabilityResult {
  // `null` until one value is picked on every axis; once complete, the
  // matching skuId, if one exists.
  resolvedSkuId: number | null;
  axes: ProductAvailabilityAxis[];
}

interface RawProductAvailabilityResult {
  resolvedSkuId: number | null;
  axes: ProductAvailabilityAxis[] | null;
}

// A fully-resolved variant's own price/shipping fields, from `*GET_SKU`.
export interface ProductSkuDetail {
  skuId: number;
  productPk: number;
  skuCode: string;
  basePrice: number;
  comparePrice: number;
  msrp: number;
  weight: number;
  weightUnit: string;
  isDefault: string;
  requiresShip: string;
  isTaxable: string;
  variantImageUrl: string;
}

interface ApiFailure {
  success: false;
  message: string | null;
}

function groupOptionsByAxis(options: readonly ProductOptionValue[]): ProductOptionAxis[] {
  const axesByName = new Map<string, ProductOptionAxis>();
  for (const option of options) {
    const axis = axesByName.get(option.optName);
    if (axis) {
      axis.values.push(option);
    } else {
      axesByName.set(option.optName, { optName: option.optName, optOrder: option.optOrder, values: [option] });
    }
  }
  return [...axesByName.values()]
    .sort((a, b) => a.optOrder - b.optOrder)
    .map((axis) => ({ ...axis, values: [...axis.values].sort((a, b) => a.valSeq - b.valSeq) }));
}

// The gallery can otherwise show the same photo twice (e.g. a product image
// and a sku-specific one that happen to point at the same file) — keep only
// the first occurrence of each `imageUrl`.
function dedupeImages(images: readonly ProductImage[]): ProductImage[] {
  const seenUrls = new Set<string>();
  return images.filter((image) => {
    if (seenUrls.has(image.imageUrl)) {
      return false;
    }
    seenUrls.add(image.imageUrl);
    return true;
  });
}

// The live API sometimes sends `null` for an array field instead of `[]` —
// normalize once here so nothing downstream has to defensively null-check
// every list.
function normalizeProductDetailData(raw: RawProductDetailData): ProductDetailData {
  return {
    product: raw.product,
    images: dedupeImages(
      (raw.images ?? []).map((image) => ({
        ...image,
        skuId: image.skuId ?? null,
        optionIds: image.optionIds ?? [],
      })),
    ),
    axes: groupOptionsByAxis(raw.options ?? []),
    attributes: raw.attributes ?? [],
    breadcrumb: normalizeBreadcrumb(raw.breadcrumb),
  };
}

@Injectable({ providedIn: 'root' })
export class ProductDetailService {
  private readonly http = inject(HttpClient);
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCPRDDTL`;

  // The product header, images, and full option list — every value starts
  // enabled; there's no SKU matrix here anymore, so availability has to be
  // asked for separately (see `checkAvailability`). `locationId` scopes
  // pricing/availability to the shopper's active location — `null` only in
  // the narrow window before one's known yet (e.g. right after login,
  // before the employee's locations have loaded). `categoryId` is the
  // listing the shopper clicked the product from — it disambiguates which
  // of a product's several category placements the returned `breadcrumb`
  // should follow; omit it entirely for a deep link, search result, or
  // bucket page, where there's no such listing to match.
  load(productPk: number, locationId: number | null, categoryId?: number): Observable<ProductDetailData> {
    return this.http
      .post<RawProductDetailData | ApiFailure>(this.dispatchUrl, {
        action: '*GET',
        productPk,
        locationId,
        ...(categoryId !== undefined ? { categoryId } : {}),
      })
      .pipe(
        map((response) => {
          if (!('product' in response) || !response.product) {
            throw new Error((response as ApiFailure).message ?? 'We could not load this product.');
          }
          return normalizeProductDetailData(response);
        }),
      );
  }

  // Call on every selection change, including the very first with nothing
  // picked yet — `selectedOptIds` is whatever's currently chosen across all
  // axes (it's fine to include the axis being displayed; the server ignores
  // an axis's own picks when computing that same axis's own availability).
  checkAvailability(
    productPk: number,
    selectedOptIds: readonly number[],
    locationId: number | null,
  ): Observable<ProductAvailabilityResult> {
    return this.http
      .post<RawProductAvailabilityResult | ApiFailure>(this.dispatchUrl, {
        action: '*AVAIL',
        productPk,
        selections: selectedOptIds.map((optId) => ({ optId })),
        locationId,
      })
      .pipe(
        map((response) => {
          if (!('axes' in response) || !response.axes) {
            throw new Error(
              (response as ApiFailure).message ?? 'We could not check option availability.',
            );
          }
          return { resolvedSkuId: response.resolvedSkuId ?? null, axes: response.axes };
        }),
      );
  }

  // Only call once `checkAvailability` resolves to a non-null skuId —
  // there's nothing to fetch before that.
  getSku(skuId: number, locationId: number | null): Observable<ProductSkuDetail> {
    return this.http
      .post<ProductSkuDetail | ApiFailure>(this.dispatchUrl, { action: '*GET_SKU', skuId, locationId })
      .pipe(
        map((response) => {
          if (!('skuId' in response) || !response.skuId) {
            throw new Error((response as ApiFailure).message ?? 'We could not load this option.');
          }
          return response;
        }),
      );
  }
}
