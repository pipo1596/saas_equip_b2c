import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CatalogProductsService, ProductSearchResult } from './catalog-products';

const SAMPLE: ProductSearchResult = {
  products: [
    {
      productPk: 4021,
      productId: 'SFD-SHRT-214',
      title: 'Sworn duty shirt, long sleeve',
      skuCode: 'SFD-SHRT-214-BLK-M',
      price: 54,
      imageUrl: '',
      colors: [{ valueDesc: 'Black', valueCode: '#0B0B0B' }],
    },
  ],
  totalCount: 32,
  page: 1,
  pageSize: 9,
  categoryFacets: [{ progCatId: 5510, categoryName: 'Long sleeve', count: 14 }],
  sizeFacets: [{ value: 'M', count: 9 }],
  colorFacets: [{ value: 'Black', valueCode: '#0B0B0B', count: 7 }],
};

describe('CatalogProductsService', () => {
  let service: CatalogProductsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogProductsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('searches by category, omitting bucket/search/sizes/colors/page when not given', () => {
    let result: ProductSearchResult | undefined;
    service.search({ locationId: 18, categoryId: 5510 }).subscribe((r) => (result = r));

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      categoryId: 5510,
    });
    req.flush(SAMPLE);

    expect(result).toEqual(SAMPLE);
  });

  it('searches by bucket instead of category', () => {
    service.search({ locationId: 18, bucket: 'CLOTHING' }).subscribe();

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      bucket: 'CLOTHING',
    });
    req.flush(SAMPLE);
  });

  it('includes search, sizes, colors, and paging only when provided', () => {
    service
      .search({
        locationId: 18,
        search: 'shirt',
        sizes: ['S', 'M'],
        colors: ['Black'],
        page: 2,
        pageSize: 9,
      })
      .subscribe();

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      search: 'shirt',
      sizes: ['S', 'M'],
      colors: ['Black'],
      page: 2,
      pageSize: 9,
    });
    req.flush(SAMPLE);
  });

  it('omits empty sizes/colors arrays and a blank search term', () => {
    service.search({ locationId: 18, search: '', sizes: [], colors: [] }).subscribe();

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
    });
    req.flush(SAMPLE);
  });

  it('normalizes null array fields to empty arrays, since the live API sends null instead of []', () => {
    let result: ProductSearchResult | undefined;
    service.search({ locationId: 18, categoryId: 5510 }).subscribe((r) => (result = r));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush({
      products: [
        {
          productPk: 4022,
          productId: 'SFD-SHRT-215',
          title: 'Sworn duty shirt (no colors)',
          skuCode: 'SFD-SHRT-215-M',
          price: 54,
          imageUrl: '',
          colors: null,
        },
      ],
      totalCount: 1,
      page: 1,
      pageSize: 9,
      categoryFacets: null,
      sizeFacets: null,
      colorFacets: null,
    } as never);

    expect(result?.products[0].colors).toEqual([]);
    expect(result?.categoryFacets).toEqual([]);
    expect(result?.sizeFacets).toEqual([]);
    expect(result?.colorFacets).toEqual([]);
  });
});
