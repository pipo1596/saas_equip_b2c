import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  CatalogCategory,
  CatalogView,
  CatalogViewService,
  LeafCategoriesResponse,
  allCategoryRoots,
  categoryProductCount,
  collectCategoryIds,
  filterCategoryTree,
  findCategoryPath,
} from './catalog-view';

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
        productCount: 0,
        children: [
          {
            progCatId: 321,
            parentProgCatId: 310,
            categoryName: 'Boot',
            sortOrder: 0,
            status: 'ACTIVE',
            productCount: 12,
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
        productCount: 25,
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

  it('normalizes a null children array and a null/missing productCount to empty/zero, recursively', () => {
    let result: CatalogView | undefined;
    service.load(18).subscribe((view) => (result = view));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPCVEW').flush({
      viewId: 6,
      programId: 28,
      categoryCount: 1,
      menu: {
        clothing: [
          {
            progCatId: 100,
            parentProgCatId: null,
            categoryName: 'Clothing',
            sortOrder: 0,
            status: 'ACTIVE',
            productCount: null,
            children: [
              {
                progCatId: 101,
                parentProgCatId: 100,
                categoryName: 'Shirt',
                sortOrder: 0,
                status: 'ACTIVE',
                children: null,
              },
            ],
          },
        ],
        footwear: null,
        gear: null,
      },
    } as never);

    expect(result?.menu.clothing[0].productCount).toBe(0);
    expect(result?.menu.clothing[0].children[0]).toEqual({
      progCatId: 101,
      parentProgCatId: 100,
      categoryName: 'Shirt',
      sortOrder: 0,
      status: 'ACTIVE',
      productCount: 0,
      children: [],
    });
    expect(result?.menu.footwear).toEqual([]);
    expect(result?.menu.gear).toEqual([]);
  });
});

describe('category tree helpers', () => {
  const LEAF_A: CatalogCategory = {
    progCatId: 2,
    parentProgCatId: 1,
    categoryName: 'Long Sleeve',
    sortOrder: 0,
    status: 'ACTIVE',
    productCount: 14,
    children: [],
  };
  const LEAF_B: CatalogCategory = {
    progCatId: 3,
    parentProgCatId: 1,
    categoryName: 'Short Sleeve',
    sortOrder: 1,
    status: 'ACTIVE',
    productCount: 14,
    children: [],
  };
  const UNIFORM: CatalogCategory = {
    progCatId: 1,
    parentProgCatId: 0,
    categoryName: 'Uniform',
    sortOrder: 0,
    status: 'ACTIVE',
    productCount: 0,
    children: [LEAF_A, LEAF_B],
  };
  const CLOTHING: CatalogCategory = {
    progCatId: 0,
    parentProgCatId: null,
    categoryName: 'Clothing',
    sortOrder: 0,
    status: 'ACTIVE',
    productCount: 0,
    children: [UNIFORM],
  };
  const MENU = { clothing: [CLOTHING], footwear: [], gear: [] };

  describe('categoryProductCount', () => {
    it("returns a leaf's own count", () => {
      expect(categoryProductCount(LEAF_A)).toBe(14);
    });

    it("sums every leaf descendant for a parent, ignoring its own productCount", () => {
      expect(categoryProductCount(UNIFORM)).toBe(28);
      expect(categoryProductCount(CLOTHING)).toBe(28);
    });
  });

  describe('allCategoryRoots', () => {
    it('flattens every bucket array into one list', () => {
      const menu = { clothing: [CLOTHING], footwear: [LEAF_A], gear: [LEAF_B] };
      expect(allCategoryRoots(menu)).toEqual([CLOTHING, LEAF_A, LEAF_B]);
    });
  });

  describe('findCategoryPath', () => {
    it('returns the root-first path down to a matching node', () => {
      expect(findCategoryPath(MENU.clothing, 2)).toEqual([CLOTHING, UNIFORM, LEAF_A]);
    });

    it('returns a single-entry path for a top-level match', () => {
      expect(findCategoryPath(MENU.clothing, 0)).toEqual([CLOTHING]);
    });

    it('returns null when nothing matches', () => {
      expect(findCategoryPath(MENU.clothing, 999)).toBeNull();
    });
  });

  describe('filterCategoryTree', () => {
    it('returns everything unfiltered for a blank query', () => {
      expect(filterCategoryTree(MENU.clothing, '')).toEqual(MENU.clothing);
    });

    it('keeps the whole subtree below a direct name match', () => {
      expect(filterCategoryTree(MENU.clothing, 'uniform')).toEqual([
        { ...CLOTHING, children: [UNIFORM] },
      ]);
    });

    it('keeps only the branch leading to a matching descendant, case-insensitively', () => {
      expect(filterCategoryTree(MENU.clothing, 'LONG')).toEqual([
        { ...CLOTHING, children: [{ ...UNIFORM, children: [LEAF_A] }] },
      ]);
    });

    it('returns an empty array when nothing matches', () => {
      expect(filterCategoryTree(MENU.clothing, 'nonexistent')).toEqual([]);
    });
  });

  describe('collectCategoryIds', () => {
    it('collects every id in the tree, including nested descendants', () => {
      expect(collectCategoryIds(MENU.clothing)).toEqual([0, 1, 2, 3]);
    });
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
