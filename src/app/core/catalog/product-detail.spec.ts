import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  ProductAvailabilityResult,
  ProductDetailData,
  ProductDetailInfo,
  ProductDetailService,
  ProductSkuDetail,
} from './product-detail';

const PRODUCT: ProductDetailInfo = {
  productPk: 12345,
  productId: 'ABC-100',
  handle: 'mens-trail-jacket',
  title: "Men's Trail Jacket",
  descr: 'Short marketing blurb',
  longDescr: 'Full HTML/long description',
  features: '',
  construction: '',
  vendor: 'Acme Outdoor',
  brandId: 7,
  brandName: 'Acme',
  brandLogoUrl: '',
  productType: 'Jackets',
  status: 'ACTIVE',
  gender: 'Mens',
  published: 'Y',
  giftCard: 'N',
  productCond: 'New',
  allowBackorder: 'N',
  tags: 'outdoor,jacket',
  techSpec: '',
  techSpecImg: '',
  minPrice: 79.99,
  maxPrice: 94.99,
  minPoints: 800,
  maxPoints: 950,
};

const LOCATION_ID = 18;

describe('ProductDetailService', () => {
  let service: ProductDetailService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProductDetailService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('load', () => {
    it('posts *GET with the productPk and groups the flat options list into axes', () => {
      let result: ProductDetailData | undefined;
      service.load(12345, LOCATION_ID).subscribe((data) => (result = data));

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL');
      expect(req.request.body).toEqual({ action: '*GET', productPk: 12345, locationId: LOCATION_ID });
      req.flush({
        product: PRODUCT,
        images: null,
        options: [
          { optId: 201, optName: 'Size', optOrder: 2, valueCode: '', valueDesc: 'M', swatchColor: '', swatchImg: '', valSeq: 1 },
          { optId: 101, optName: 'Color', optOrder: 1, valueCode: '#000000', valueDesc: 'Black', swatchColor: '#000000', swatchImg: '', valSeq: 1 },
        ],
      });

      expect(result?.product).toEqual(PRODUCT);
      expect(result?.images).toEqual([]);
      // Grouped by optName and ordered by optOrder, regardless of the order
      // the flat list happened to arrive in.
      expect(result?.axes.map((axis) => axis.optName)).toEqual(['Color', 'Size']);
    });

    it('includes categoryId in the body when the shopper came from a listing', () => {
      service.load(12345, LOCATION_ID, 45).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL');
      expect(req.request.body).toEqual({
        action: '*GET',
        productPk: 12345,
        locationId: LOCATION_ID,
        categoryId: 45,
      });
      req.flush({ product: PRODUCT, images: null, options: null });
    });

    it('passes through the breadcrumb, normalizing a missing inner trail to []', () => {
      let result: ProductDetailData | undefined;
      service.load(12345, LOCATION_ID).subscribe((data) => (result = data));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL').flush({
        product: PRODUCT,
        images: null,
        options: null,
        breadcrumb: {
          programId: 3,
          programName: 'ANB Standard Program',
          progCatId: 52,
          breadcrumb: null,
        },
      });

      expect(result?.breadcrumb).toEqual({
        programId: 3,
        programName: 'ANB Standard Program',
        progCatId: 52,
        breadcrumb: [],
      });
    });

    it('passes through a real breadcrumb trail as-is', () => {
      let result: ProductDetailData | undefined;
      service.load(12345, LOCATION_ID).subscribe((data) => (result = data));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL').flush({
        product: PRODUCT,
        images: null,
        options: null,
        breadcrumb: {
          programId: 3,
          programName: 'ANB Standard Program',
          progCatId: 52,
          breadcrumb: [
            { progCatId: 40, categoryName: 'Clothing' },
            { progCatId: 45, categoryName: 'Shirts' },
            { progCatId: 52, categoryName: 'Polos' },
          ],
        },
      });

      expect(result?.breadcrumb?.breadcrumb).toEqual([
        { progCatId: 40, categoryName: 'Clothing' },
        { progCatId: 45, categoryName: 'Shirts' },
        { progCatId: 52, categoryName: 'Polos' },
      ]);
    });

    it('normalizes a missing breadcrumb to null', () => {
      let result: ProductDetailData | undefined;
      service.load(12345, LOCATION_ID).subscribe((data) => (result = data));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL')
        .flush({ product: PRODUCT, images: null, options: null });

      expect(result?.breadcrumb).toBeNull();
    });

    it('normalizes a null options/images list to empty arrays', () => {
      let result: ProductDetailData | undefined;
      service.load(12345, LOCATION_ID).subscribe((data) => (result = data));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL').flush({
        product: PRODUCT,
        images: null,
        options: null,
      });

      expect(result?.images).toEqual([]);
      expect(result?.axes).toEqual([]);
    });

    it('passes through the attributes array, and normalizes a missing one to []', () => {
      let result: ProductDetailData | undefined;
      service.load(12345, LOCATION_ID).subscribe((data) => (result = data));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL').flush({
        product: PRODUCT,
        images: null,
        options: null,
        attributes: [
          { attrId: 14, attrName: 'attrib1', attrValue: 'value1' },
          { attrId: 15, attrName: 'attrib2', attrValue: 'value2' },
        ],
      });

      expect(result?.attributes).toEqual([
        { attrId: 14, attrName: 'attrib1', attrValue: 'value1' },
        { attrId: 15, attrName: 'attrib2', attrValue: 'value2' },
      ]);
    });

    it('normalizes a missing attributes field to []', () => {
      let result: ProductDetailData | undefined;
      service.load(12345, LOCATION_ID).subscribe((data) => (result = data));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL').flush({
        product: PRODUCT,
        images: null,
        options: null,
      });

      expect(result?.attributes).toEqual([]);
    });

    it('drops duplicate images that share the same imageUrl', () => {
      let result: ProductDetailData | undefined;
      service.load(12345, LOCATION_ID).subscribe((data) => (result = data));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL').flush({
        product: PRODUCT,
        images: [
          { imageId: 1, skuId: null, imageUrl: 'https://cdn.example.com/hero.jpg', imageType: 'gallery', imageDesc: '', sortOrder: 0 },
          { imageId: 2, skuId: null, imageUrl: 'https://cdn.example.com/side.jpg', imageType: 'gallery', imageDesc: '', sortOrder: 1 },
          // Same URL as imageId 1, e.g. a sku-specific entry pointing at the
          // same file — should be suppressed, keeping the first occurrence.
          { imageId: 3, skuId: 9001, imageUrl: 'https://cdn.example.com/hero.jpg', imageType: 'variant', imageDesc: '', sortOrder: 2 },
        ],
        options: null,
      });

      expect(result?.images.map((image) => image.imageId)).toEqual([1, 2]);
    });

    it('dedupes down to the distinct photos when every sku duplicates the same images (real-world shape)', () => {
      // The live API never sends `skuId: null` at all in practice — every
      // image row is tagged with *some* skuId, but a product with no
      // per-variant photography has every one of its SKUs point at the
      // exact same handful of photos. Deduping by URL is what keeps the
      // gallery to just those distinct photos instead of one entry per SKU.
      let result: ProductDetailData | undefined;
      service.load(12345, LOCATION_ID).subscribe((data) => (result = data));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL').flush({
        product: PRODUCT,
        images: [
          { imageId: 81041, skuId: 63463, imageUrl: '/photos/partner-2/products/111009-729-EFD.JPG', imageType: 'large', imageDesc: '', sortOrder: 0 },
          { imageId: 81042, skuId: 63463, imageUrl: '/photos/partner-2/products/111009-729+BACK.JPG', imageType: 'gallery', imageDesc: '', sortOrder: 1 },
          { imageId: 81044, skuId: 63464, imageUrl: '/photos/partner-2/products/111009-729-EFD.JPG', imageType: 'large', imageDesc: '', sortOrder: 0 },
          { imageId: 81045, skuId: 63464, imageUrl: '/photos/partner-2/products/111009-729+BACK.JPG', imageType: 'gallery', imageDesc: '', sortOrder: 1 },
        ],
        options: null,
      });

      expect(result?.images.map((image) => image.imageId)).toEqual([81041, 81042]);
    });

    it('passes through each image\'s own optionIds, and normalizes a missing one to []', () => {
      let result: ProductDetailData | undefined;
      service.load(12345, LOCATION_ID).subscribe((data) => (result = data));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL').flush({
        product: PRODUCT,
        images: [
          { imageId: 101051, skuId: 91764, imageUrl: '/photos/partner-2/products/color1.avif', imageType: 'large', imageDesc: '', sortOrder: 0, optionIds: [35796] },
          { imageId: 101099, skuId: 91770, imageUrl: '/photos/partner-2/products/general.avif', imageType: 'gallery', imageDesc: '', sortOrder: 0 },
        ],
        options: null,
      });

      expect(result?.images).toEqual([
        expect.objectContaining({ imageId: 101051, optionIds: [35796] }),
        expect.objectContaining({ imageId: 101099, optionIds: [] }),
      ]);
    });

    it('errors with the API message when the response carries no product', () => {
      let error: unknown;
      service.load(12345, LOCATION_ID).subscribe({ error: (err) => (error = err) });

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL')
        .flush({ success: false, message: 'Product not found.' });

      expect((error as Error).message).toBe('Product not found.');
    });

    it('falls back to a generic message when the API omits one', () => {
      let error: unknown;
      service.load(12345, LOCATION_ID).subscribe({ error: (err) => (error = err) });

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL').flush({ success: false, message: null });

      expect((error as Error).message).toBe('We could not load this product.');
    });
  });

  describe('checkAvailability', () => {
    it('posts *AVAIL with the productPk and one {optId} entry per selection', () => {
      let result: ProductAvailabilityResult | undefined;
      service.checkAvailability(12345, [101], LOCATION_ID).subscribe((data) => (result = data));

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL');
      expect(req.request.body).toEqual({
        action: '*AVAIL',
        productPk: 12345,
        selections: [{ optId: 101 }],
        locationId: LOCATION_ID,
      });
      req.flush({
        resolvedSkuId: null,
        axes: [
          { optName: 'Color', optOrder: 1, availableOptIds: [101, 102] },
          { optName: 'Size', optOrder: 2, availableOptIds: [201] },
        ],
      });

      expect(result?.resolvedSkuId).toBeNull();
      expect(result?.axes).toEqual([
        { optName: 'Color', optOrder: 1, availableOptIds: [101, 102] },
        { optName: 'Size', optOrder: 2, availableOptIds: [201] },
      ]);
    });

    it('sends an empty selections array for the very first, unfiltered check', () => {
      service.checkAvailability(12345, [], LOCATION_ID).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL');
      expect(req.request.body).toEqual({
        action: '*AVAIL',
        productPk: 12345,
        selections: [],
        locationId: LOCATION_ID,
      });
      req.flush({ resolvedSkuId: null, axes: [] });
    });

    it('passes through a resolved skuId once the selection is complete', () => {
      let result: ProductAvailabilityResult | undefined;
      service.checkAvailability(12345, [101, 201], LOCATION_ID).subscribe((data) => (result = data));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL').flush({
        resolvedSkuId: 9001,
        axes: [
          { optName: 'Color', optOrder: 1, availableOptIds: [101] },
          { optName: 'Size', optOrder: 2, availableOptIds: [201] },
        ],
      });

      expect(result?.resolvedSkuId).toBe(9001);
    });

    it('errors with the API message when the response carries no axes', () => {
      let error: unknown;
      service.checkAvailability(12345, [], LOCATION_ID).subscribe({ error: (err) => (error = err) });

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL')
        .flush({ success: false, message: 'Could not check availability.' });

      expect((error as Error).message).toBe('Could not check availability.');
    });
  });

  describe('getSku', () => {
    it('posts *GET_SKU with the skuId and returns the sku record', () => {
      let result: ProductSkuDetail | undefined;
      service.getSku(9001, LOCATION_ID).subscribe((data) => (result = data));

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL');
      expect(req.request.body).toEqual({ action: '*GET_SKU', skuId: 9001, locationId: LOCATION_ID });
      req.flush({
        skuId: 9001,
        productPk: 12345,
        skuCode: 'ABC-100-BLK-M',
        basePrice: 89.99,
        comparePrice: 110,
        points: 900,
        msrp: 110,
        weight: 1.2,
        weightUnit: 'lb',
        isDefault: 'Y',
        requiresShip: 'Y',
        isTaxable: 'Y',
        variantImageUrl: '',
      });

      expect(result?.skuCode).toBe('ABC-100-BLK-M');
      expect(result?.basePrice).toBe(89.99);
      expect(result?.points).toBe(900);
    });

    it("prefers customerPrice's price/points over the sku's own list price/points when present", () => {
      let result: ProductSkuDetail | undefined;
      service.getSku(65498, LOCATION_ID).subscribe((data) => (result = data));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL').flush({
        skuId: 65498,
        productPk: 4668,
        skuCode: 'COE-6277-EFD-S-M',
        basePrice: 25,
        comparePrice: null,
        points: 10,
        msrp: null,
        weight: null,
        weightUnit: 'LB',
        isDefault: 'N',
        requiresShip: 'Y',
        isTaxable: 'Y',
        variantImageUrl: null,
        customerPrice: {
          price: 10,
          points: 5,
          compareAtPrice: null,
          source: 'PRICE_LIST',
          priceListId: 8,
        },
      });

      expect(result?.basePrice).toBe(10);
      expect(result?.points).toBe(5);
    });

    it('errors with the API message when the response carries no skuId', () => {
      let error: unknown;
      service.getSku(9001, LOCATION_ID).subscribe({ error: (err) => (error = err) });

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCPRDDTL')
        .flush({ success: false, message: 'Sku not found.' });

      expect((error as Error).message).toBe('Sku not found.');
    });
  });
});
