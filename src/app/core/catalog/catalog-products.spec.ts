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
      colors: [
        { valueDesc: 'Black', valueCode: '#0B0B0B', valueSwtchColor: '#0B0B0B', valueSwtchImage: '' },
      ],
    },
  ],
  totalCount: 32,
  page: 1,
  pageSize: 9,
  categoryFacets: [{ progCatId: 5510, categoryName: 'Long sleeve', count: 14 }],
  optionFacets: [
    {
      optionName: 'Size',
      values: [{ value: 'M', valueCode: '', count: 9 }],
    },
    {
      optionName: 'Color',
      values: [{ value: 'Black', valueCode: '#0B0B0B', count: 7 }],
    },
  ],
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

  it('searches by category, omitting bucket/search/optionFilters/page when not given', () => {
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

  it('includes search, paging, and a flattened optionFilters string only when provided', () => {
    service
      .search({
        locationId: 18,
        search: 'shirt',
        optionFilters: { Size: ['S', 'M'], Color: ['Black'] },
        page: 2,
        pageSize: 9,
      })
      .subscribe();

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      search: 'shirt',
      optionFilters: 'Size:S,M;Color:Black',
      page: 2,
      pageSize: 9,
    });
    req.flush(SAMPLE);
  });

  it('drops option groups with no selected values from the flattened string', () => {
    service
      .search({ locationId: 18, optionFilters: { Size: [], Color: ['Navy'] } })
      .subscribe();

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      optionFilters: 'Color:Navy',
    });
    req.flush(SAMPLE);
  });

  it('omits optionFilters entirely and a blank search term when nothing is selected', () => {
    service
      .search({ locationId: 18, search: '', optionFilters: { Size: [], Color: [] } })
      .subscribe();

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
      optionFacets: null,
    } as never);

    expect(result?.products[0].colors).toEqual([]);
    expect(result?.categoryFacets).toEqual([]);
    expect(result?.optionFacets).toEqual([]);
  });

  it('normalizes a missing valueSwtchColor/valueSwtchImage on a color to empty strings', () => {
    let result: ProductSearchResult | undefined;
    service.search({ locationId: 18, categoryId: 5510 }).subscribe((r) => (result = r));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush({
      products: [
        {
          productPk: 4022,
          productId: 'SFD-SHRT-215',
          title: 'Sworn duty shirt',
          skuCode: 'SFD-SHRT-215-M',
          price: 54,
          imageUrl: '',
          colors: [{ valueDesc: 'White', valueCode: 'WHITE', valueSwtchColor: null, valueSwtchImage: null }],
        },
      ],
      totalCount: 1,
      page: 1,
      pageSize: 9,
      categoryFacets: null,
      optionFacets: null,
    } as never);

    expect(result?.products[0].colors).toEqual([
      { valueDesc: 'White', valueCode: 'WHITE', valueSwtchColor: '', valueSwtchImage: '' },
    ]);
  });

  it('normalizes a null values array within an option facet group to an empty array', () => {
    let result: ProductSearchResult | undefined;
    service.search({ locationId: 18, categoryId: 5510 }).subscribe((r) => (result = r));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush({
      products: [],
      totalCount: 0,
      page: 1,
      pageSize: 9,
      categoryFacets: [],
      optionFacets: [{ optionName: 'Size', values: null }],
    } as never);

    expect(result?.optionFacets).toEqual([{ optionName: 'Size', values: [] }]);
  });
});
