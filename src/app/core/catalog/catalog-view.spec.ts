import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CatalogView, CatalogViewService, LeafCategoriesResponse } from './catalog-view';

const SAMPLE: CatalogView = {
  viewId: 6,
  programId: 28,
  categoryCount: 2,
  menu: {
    clothing: [],
    footwear: [
      {
        progCatId: 310,
        parentProgCatId: null,
        categoryName: 'Footwear',
        sortOrder: 0,
        status: 'ACTIVE',
        children: [
          {
            progCatId: 321,
            parentProgCatId: 310,
            categoryName: 'Boot',
            sortOrder: 0,
            status: 'ACTIVE',
            children: [],
          },
        ],
      },
    ],
    gear: [
      {
        progCatId: 313,
        parentProgCatId: null,
        categoryName: 'Duty Gear',
        sortOrder: 0,
        status: 'ACTIVE',
        children: [],
      },
    ],
  },
};

describe('CatalogViewService', () => {
  let service: CatalogViewService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogViewService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts with no cached menu', () => {
    expect(service.menu()).toBeNull();
  });

  it('fetches the menu for a location and caches it', () => {
    let result: CatalogView | undefined;
    service.load(18).subscribe((view) => (result = view));

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ locationId: 18, action: '*MENU' });
    req.flush(SAMPLE);

    expect(result).toEqual(SAMPLE);
    expect(service.menu()).toEqual(SAMPLE.menu);
  });

  it('fetches fresh when the location changes', () => {
    service.load(18).subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush(SAMPLE);

    service.load(15).subscribe();
    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.body).toEqual({ locationId: 15, action: '*MENU' });
    req.flush({ ...SAMPLE, menu: { clothing: [], footwear: [], gear: [] } });

    expect(service.menu()).toEqual({ clothing: [], footwear: [], gear: [] });
  });

  it('reuses the cached response for a repeat call with the same location, without a new request', () => {
    let first: CatalogView | undefined;
    let second: CatalogView | undefined;
    service.load(18).subscribe((view) => (first = view));
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush(SAMPLE);

    service.load(18).subscribe((view) => (second = view));

    httpMock.expectNone('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(first).toEqual(SAMPLE);
    expect(second).toEqual(SAMPLE);
  });

  it('shares one in-flight request between concurrent calls for the same location', () => {
    let first: CatalogView | undefined;
    let second: CatalogView | undefined;
    service.load(18).subscribe((view) => (first = view));
    service.load(18).subscribe((view) => (second = view));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush(SAMPLE);

    expect(first).toEqual(SAMPLE);
    expect(second).toEqual(SAMPLE);
  });
});

describe('CatalogViewService.loadCategories', () => {
  let service: CatalogViewService;
  let httpMock: HttpTestingController;

  const CATEGORIES_SAMPLE: LeafCategoriesResponse = {
    categories: [
      {
        progCatId: 5510,
        categoryName: 'Long sleeve',
        productCount: 14,
        imageUrl: 'https://cdn.example.com/long-sleeve.jpg',
      },
      {
        progCatId: 5511,
        categoryName: 'Short sleeve',
        productCount: 11,
        imageUrl: 'https://cdn.example.com/short-sleeve.jpg',
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogViewService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('starts with no cached categories', () => {
    expect(service.categories()).toEqual([]);
  });

  it('fetches the leaf categories for a location and caches them', () => {
    let result: LeafCategoriesResponse | undefined;
    service.loadCategories(42).subscribe((response) => (result = response));

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ locationId: 42, action: '*CATEGORIES' });
    req.flush(CATEGORIES_SAMPLE);

    expect(result).toEqual(CATEGORIES_SAMPLE);
    expect(service.categories()).toEqual(CATEGORIES_SAMPLE.categories);
  });

  it('normalizes a null categories array to an empty array', () => {
    let result: LeafCategoriesResponse | undefined;
    service.loadCategories(42).subscribe((response) => (result = response));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush({ categories: null } as never);

    expect(result).toEqual({ categories: [] });
    expect(service.categories()).toEqual([]);
  });

  it('fetches fresh when the location changes', () => {
    service.loadCategories(42).subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush(CATEGORIES_SAMPLE);

    service.loadCategories(43).subscribe();
    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.body).toEqual({ locationId: 43, action: '*CATEGORIES' });
    req.flush({ categories: [] });

    expect(service.categories()).toEqual([]);
  });

  it('reuses the cached response for a repeat call with the same location, without a new request', () => {
    let first: LeafCategoriesResponse | undefined;
    let second: LeafCategoriesResponse | undefined;
    service.loadCategories(42).subscribe((response) => (first = response));
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush(CATEGORIES_SAMPLE);

    service.loadCategories(42).subscribe((response) => (second = response));

    httpMock.expectNone('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(first).toEqual(CATEGORIES_SAMPLE);
    expect(second).toEqual(CATEGORIES_SAMPLE);
  });

  it('shares one in-flight request between concurrent calls for the same location', () => {
    let first: LeafCategoriesResponse | undefined;
    let second: LeafCategoriesResponse | undefined;
    service.loadCategories(42).subscribe((response) => (first = response));
    service.loadCategories(42).subscribe((response) => (second = response));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush(CATEGORIES_SAMPLE);

    expect(first).toEqual(CATEGORIES_SAMPLE);
    expect(second).toEqual(CATEGORIES_SAMPLE);
  });

  it('caches the menu and the categories independently of each other', () => {
    service.load(42).subscribe();
    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush(SAMPLE);

    // Same location, but a fetch of the *other* dataset — should still hit
    // the network rather than being mistaken for an already-cached call.
    service.loadCategories(42).subscribe();
    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW');
    expect(req.request.body).toEqual({ locationId: 42, action: '*CATEGORIES' });
    req.flush(CATEGORIES_SAMPLE);

    expect(service.menu()).toEqual(SAMPLE.menu);
    expect(service.categories()).toEqual(CATEGORIES_SAMPLE.categories);
  });
});
