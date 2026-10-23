import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../../core/auth/auth';
import { FAKE_SESSION } from '../../../core/auth/auth.testing';
import { CartService } from '../../../core/cart/cart';
import { POINTS_ONLY_ALLOTMENT } from '../../../core/cart/cart.testing';
import { ProductFacetsResult, ProductListResult } from '../../../core/catalog/catalog-products';
import { ProductList } from './product-list';

const LOCATIONS = [
  { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Edmonton Fire Dept Chief' },
];

const SAMPLE_LIST: ProductListResult = {
  breadcrumb: null,
  products: [
    {
      productPk: 4021,
      productId: 'SFD-SHRT-214',
      title: 'Sworn duty shirt, long sleeve',
      skuCode: 'SFD-SHRT-214-BLK-M',
      priceRange: { min: 49.99, max: 64.99 },
      pointsRange: { min: 500, max: 650 },
      imageUrl: '',
      colors: [
        { valueDesc: 'Black', valueCode: 'BLACK', valueSwtchColor: 'black', valueSwtchImage: '' },
      ],
      progCatIds: [5510],
    },
  ],
  totalCount: 32,
  page: 1,
  pageSize: 24,
};

const SAMPLE_FACETS: ProductFacetsResult = {
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

// `<app-header/>` is rendered by this page and independently hits the exact
// same SEPGM (APCTPCVEW, action *MENU) once a location is active, and also
// APCTPSTNGS for tenant settings — so a plain `expectOne(url)` can't tell
// the grid's own calls apart from the header's own incidental one.
function expectProductListRequest(httpMock: HttpTestingController): TestRequest {
  const matches = httpMock.match(
    (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCVEW' && req.body?.action === '*PRODUCT_LIST',
  );
  expect(matches.length).toBe(1);
  return matches[0];
}

function expectProductFacetsRequest(httpMock: HttpTestingController): TestRequest {
  const matches = httpMock.match(
    (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCVEW' && req.body?.action === '*PRODUCT_FACETS',
  );
  expect(matches.length).toBe(1);
  return matches[0];
}

function expectNoProductFacetsRequest(httpMock: HttpTestingController): void {
  expect(
    httpMock.match(
      (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCVEW' && req.body?.action === '*PRODUCT_FACETS',
    ),
  ).toHaveLength(0);
}

// Flushes the two calls fired together on first load / a scope/filter
// change (see the product-grid API's call patterns).
function flushBoth(
  httpMock: HttpTestingController,
  listOverrides: Partial<ProductListResult> = {},
  facetsOverrides: Partial<ProductFacetsResult> = {},
): void {
  expectProductListRequest(httpMock).flush({ ...SAMPLE_LIST, ...listOverrides });
  expectProductFacetsRequest(httpMock).flush({ ...SAMPLE_FACETS, ...facetsOverrides });
}

describe('ProductList', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ProductList],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(ProductList);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should fall back to a generic title when no category name is bound', () => {
    const fixture = TestBed.createComponent(ProductList);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Category');
  });

  it('shows a skeleton card grid while products are still loading, then the real cards once they resolve', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelector('.product-card__title')).toBeNull();

    flushBoth(httpMock);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.skeleton').length).toBe(0);
    expect(fixture.nativeElement.querySelector('.product-card__title')).not.toBeNull();
  });

  it('should show the bound category name as the page title', () => {
    const fixture = TestBed.createComponent(ProductList);
    fixture.componentRef.setInput('categoryId', '321');
    fixture.componentRef.setInput('name', 'Boot');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.product-list__title').textContent.trim()).toBe(
      'Boot',
    );
  });

  it('should show a search-results title when a search keyword is bound instead of a category', () => {
    const fixture = TestBed.createComponent(ProductList);
    fixture.componentRef.setInput('q', 'steel toe boots');
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.product-list__title').textContent.trim();
    expect(title).toBe('Search results for "steel toe boots"');
    expect(fixture.nativeElement.querySelector('.breadcrumb').textContent).toContain(
      'Search results',
    );
  });

  it('should not fetch products when no location is active yet', () => {
    const fixture = TestBed.createComponent(ProductList);
    fixture.componentRef.setInput('categoryId', '5510');
    fixture.detectChanges();

    expect(
      httpMock.match(
        (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCVEW' && req.body?.action === '*PRODUCT_LIST',
      ),
    ).toHaveLength(0);
  });

  it('should query by numeric category id', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    const req = expectProductListRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCT_LIST',
      locationId: 18,
      categoryId: 5510,
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE_LIST);
    expectProductFacetsRequest(httpMock).flush(SAMPLE_FACETS);
  });

  it('should fire *PRODUCT_LIST and *PRODUCT_FACETS together, *PRODUCT_LIST first', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
    fixture.detectChanges();

    const pending = httpMock.match(
      (req) =>
        req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCVEW' &&
        (req.body?.action === '*PRODUCT_LIST' || req.body?.action === '*PRODUCT_FACETS'),
    );
    expect(pending.map((req) => req.request.body.action)).toEqual(['*PRODUCT_LIST', '*PRODUCT_FACETS']);
    pending[0].flush(SAMPLE_LIST);
    pending[1].flush(SAMPLE_FACETS);
  });

  it('should link each product card to its product detail page', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.product-card');
    expect(card.tagName).toBe('A');
    expect(card.getAttribute('href')).toBe('/product/4021?categoryId=5510');
  });

  it('should show the dollar price range on the card', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
    fixture.detectChanges();
    flushBoth(httpMock);
    fixture.detectChanges();

    const priceEl: HTMLElement = fixture.nativeElement.querySelector('.product-card__price');
    expect(priceEl.textContent).toContain('$49.99');
    expect(priceEl.textContent).toContain('$64.99');
  });

  it('should show a single value (no dash) when the price range is a single price', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
    fixture.detectChanges();
    flushBoth(httpMock, {
      products: [{ ...SAMPLE_LIST.products[0], priceRange: { min: 54, max: 54 } }],
    });
    fixture.detectChanges();

    const priceEl: HTMLElement = fixture.nativeElement.querySelector('.product-card__price');
    expect(priceEl.textContent?.trim()).toBe('$54.00');
  });

  it("should show the points range instead of the dollar range when the employee's allotment is points-only", () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    TestBed.inject(CartService).cart.update((cart) => ({ ...cart, allotment: POINTS_ONLY_ALLOTMENT }));
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
    fixture.detectChanges();
    flushBoth(httpMock);
    fixture.detectChanges();

    const priceEl: HTMLElement = fixture.nativeElement.querySelector('.product-card__price');
    expect(priceEl.textContent).toContain('500');
    expect(priceEl.textContent).toContain('650');
    expect(priceEl.textContent).toContain('pts');
    expect(priceEl.textContent).not.toContain('$');
  });

  describe('allotment coverage preview', () => {
    const CATEGORY_RULE = {
      ...POINTS_ONLY_ALLOTMENT.rules[0],
      ruleId: 70,
      ruleName: 'Footwear allotment',
      allotType: 'DOLLAR' as const,
      primaryUnit: 'DOLLARS' as const,
      dollars: { total: 200, used: 0, inCart: 0, available: 200 },
      points: null,
      covers: { allAssortments: 'N' as const, categories: [{ progCatId: 5510, categoryName: 'Long sleeve' }], unitGrants: [] },
    };

    it('shows a coverage badge when the product\'s own progCatIds match a category-specific rule', () => {
      const fixture = TestBed.createComponent(ProductList);
      const auth = TestBed.inject(AuthService);
      TestBed.inject(CartService).cart.update((cart) => ({
        ...cart,
        allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [CATEGORY_RULE] },
      }));
      fixture.componentRef.setInput('categoryId', '5510');
      auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
      fixture.detectChanges();
      flushBoth(httpMock);
      fixture.detectChanges();

      const tag: HTMLElement = fixture.nativeElement.querySelector('.pay-tag');
      expect(tag?.textContent?.trim()).toBe('Footwear allotment');
    });

    it("shows no badge when the product's progCatIds don't match any rule's covered categories", () => {
      const fixture = TestBed.createComponent(ProductList);
      const auth = TestBed.inject(AuthService);
      const otherCategoryRule = {
        ...CATEGORY_RULE,
        covers: { allAssortments: 'N' as const, categories: [{ progCatId: 999, categoryName: 'Gear' }], unitGrants: [] },
      };
      TestBed.inject(CartService).cart.update((cart) => ({
        ...cart,
        allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [otherCategoryRule] },
      }));
      fixture.componentRef.setInput('categoryId', '5510');
      auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
      fixture.detectChanges();
      flushBoth(httpMock);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.pay-tag')).toBeNull();
    });

    it("shows the badge for an all-assortments rule regardless of the product's own categories", () => {
      const fixture = TestBed.createComponent(ProductList);
      const auth = TestBed.inject(AuthService);
      const allAssortmentsRule = {
        ...CATEGORY_RULE,
        ruleName: 'General Allotment',
        covers: { allAssortments: 'Y' as const, categories: [], unitGrants: [] },
      };
      TestBed.inject(CartService).cart.update((cart) => ({
        ...cart,
        allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [allAssortmentsRule] },
      }));
      fixture.componentRef.setInput('categoryId', '5510');
      auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
      fixture.detectChanges();
      flushBoth(httpMock);
      fixture.detectChanges();

      const tag: HTMLElement = fixture.nativeElement.querySelector('.pay-tag');
      expect(tag?.textContent?.trim()).toBe('General Allotment');
    });

    it('matches a units rule by its own unitGrants, not by categories — the two are separate coverage lists', () => {
      const fixture = TestBed.createComponent(ProductList);
      const auth = TestBed.inject(AuthService);
      const unitsRuleViaCategoriesOnly = {
        ...CATEGORY_RULE,
        ruleName: 'Unit Allotment',
        allotType: 'UNITS' as const,
        primaryUnit: 'UNITS' as const,
        dollars: null,
        units: { total: 5, used: 0, inCart: 0, available: 5 },
        // The product's progCatId (5510) is listed under `categories`, not
        // `unitGrants` — a units rule must not match on that.
        covers: { allAssortments: 'N' as const, categories: [{ progCatId: 5510, categoryName: 'Long sleeve' }], unitGrants: [] },
      };
      TestBed.inject(CartService).cart.update((cart) => ({
        ...cart,
        allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [unitsRuleViaCategoriesOnly] },
      }));
      fixture.componentRef.setInput('categoryId', '5510');
      auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
      fixture.detectChanges();
      flushBoth(httpMock);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.pay-tag')).toBeNull();
    });

    it('prefers a units rule over a dollar rule that also covers the same product', () => {
      const fixture = TestBed.createComponent(ProductList);
      const auth = TestBed.inject(AuthService);
      const unitsRule = {
        ...CATEGORY_RULE,
        ruleId: 71,
        ruleName: 'Unit Allotment',
        allotType: 'UNITS' as const,
        primaryUnit: 'UNITS' as const,
        dollars: null,
        units: { total: 5, used: 0, inCart: 0, available: 5 },
        covers: {
          allAssortments: 'N' as const,
          categories: [],
          unitGrants: [{ progCatId: 5510, categoryName: 'Long sleeve', unitQty: 5 }],
        },
      };
      TestBed.inject(CartService).cart.update((cart) => ({
        ...cart,
        allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [CATEGORY_RULE, unitsRule] },
      }));
      fixture.componentRef.setInput('categoryId', '5510');
      auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
      fixture.detectChanges();
      flushBoth(httpMock);
      fixture.detectChanges();

      const tag: HTMLElement = fixture.nativeElement.querySelector('.pay-tag');
      expect(tag?.textContent?.trim()).toBe('Unit Allotment');
    });

    it('shows no badge when the covering dollar rule is in scope but has no balance left — points are not a fallback', () => {
      const fixture = TestBed.createComponent(ProductList);
      const auth = TestBed.inject(AuthService);
      const emptyDollarRule = { ...CATEGORY_RULE, dollars: { total: 200, used: 200, inCart: 0, available: 0 } };
      const pointsRule = {
        ...CATEGORY_RULE,
        ruleId: 72,
        ruleName: 'Points Allowance',
        allotType: 'POINTS' as const,
        primaryUnit: 'POINTS' as const,
        dollars: null,
        points: { total: 400, used: 0, inCart: 0, available: 400 },
      };
      TestBed.inject(CartService).cart.update((cart) => ({
        ...cart,
        allotment: { ...POINTS_ONLY_ALLOTMENT, rules: [emptyDollarRule, pointsRule] },
      }));
      fixture.componentRef.setInput('categoryId', '5510');
      auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
      fixture.detectChanges();
      flushBoth(httpMock);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.pay-tag')).toBeNull();
    });
  });

  it('should omit categoryId from the product link on a bucket/full-catalog page (no real category)', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', 'full-catalog');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.product-card');
    expect(card.getAttribute('href')).toBe('/product/4021');
  });

  it('should render the API breadcrumb trail when browsing a real category', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '45');
    auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
    fixture.detectChanges();
    flushBoth(httpMock, {
      breadcrumb: {
        programId: 3,
        programName: 'ANB Standard Program',
        progCatId: 45,
        breadcrumb: [
          { progCatId: 40, categoryName: 'Clothing' },
          { progCatId: 45, categoryName: 'Shirts' },
        ],
      },
    });
    fixture.detectChanges();

    const crumbs: HTMLLIElement[] = fixture.nativeElement.querySelectorAll('.breadcrumb-item');
    expect(Array.from(crumbs).map((li) => li.textContent?.trim())).toEqual(['Home', 'Clothing', 'Shirts']);
    // The current category is the trail's own active crumb, not a link.
    expect(fixture.nativeElement.querySelector('.breadcrumb-item.active')?.textContent?.trim()).toBe(
      'Shirts',
    );
  });

  it('should fall back to Home > {pageTitle} when the API returns no breadcrumb (bucket/full-catalog/search)', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', 'full-catalog');
    auth.session.set({ ...FAKE_SESSION, locations: LOCATIONS });
    fixture.detectChanges();
    flushBoth(httpMock);
    fixture.detectChanges();

    const crumbs: HTMLLIElement[] = fixture.nativeElement.querySelectorAll('.breadcrumb-item');
    expect(Array.from(crumbs).map((li) => li.textContent?.trim())).toEqual(['Home', 'Category']);
  });

  it("should render a color swatch using the color's own swatch color", () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock);
    fixture.detectChanges();

    const swatch: HTMLElement = fixture.nativeElement.querySelector('.product-card .swatch');
    expect(swatch.title).toBe('Black');
    expect(swatch.style.background).toContain('black');
  });

  it('should render a color swatch as an image when the color has a swatch image', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock, {
      products: [
        {
          ...SAMPLE_LIST.products[0],
          colors: [
            { valueDesc: 'Black', valueCode: 'BLACK', valueSwtchColor: 'black', valueSwtchImage: '/black.png' },
          ],
        },
      ],
    });
    fixture.detectChanges();

    const swatch: HTMLElement = fixture.nativeElement.querySelector('.product-card .swatch');
    expect(swatch.style.background).toContain('/black.png');
  });

  it('should query by bucket when categoryId is a known bucket slug', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', 'footwear');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    const req = expectProductListRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCT_LIST',
      locationId: 18,
      bucket: 'FOOTWEAR',
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE_LIST);
    expectProductFacetsRequest(httpMock).flush(SAMPLE_FACETS);
  });

  it('should query the full catalog with neither categoryId nor bucket for "full-catalog"', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', 'full-catalog');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    const req = expectProductListRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCT_LIST',
      locationId: 18,
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE_LIST);
    expectProductFacetsRequest(httpMock).flush(SAMPLE_FACETS);
  });

  it('should query by search keyword when q is set and no categoryId is bound', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('q', 'steel toe boots');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    const req = expectProductListRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCT_LIST',
      locationId: 18,
      search: 'steel toe boots',
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE_LIST);
    expectProductFacetsRequest(httpMock).flush(SAMPLE_FACETS);
  });

  it('should render the returned products, count, and facets', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    flushBoth(httpMock);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('32 products');
    expect(text).toContain('Sworn duty shirt, long sleeve');
    expect(text).toContain('Size');
    expect(text).toContain('Color');
    expect(fixture.componentInstance.totalPages()).toBe(2);
  });

  it('should toggle an option filter, reset to page 1, and refetch with a flattened optionFilters string', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock);

    // A bare page change fires only *PRODUCT_LIST — facets don't depend on
    // the page.
    fixture.componentInstance.goToPage(2);
    fixture.detectChanges();
    expectProductListRequest(httpMock).flush(SAMPLE_LIST);
    expectNoProductFacetsRequest(httpMock);

    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();

    const req = expectProductListRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCT_LIST',
      locationId: 18,
      categoryId: 5510,
      optionFilters: 'Size:M',
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE_LIST);
    const facetsReq = expectProductFacetsRequest(httpMock);
    expect(facetsReq.request.body).toEqual({
      action: '*PRODUCT_FACETS',
      locationId: 18,
      categoryId: 5510,
      optionFilters: 'Size:M',
      page: 1,
      pageSize: 24,
    });
    facetsReq.flush(SAMPLE_FACETS);
    expect(fixture.componentInstance.page()).toBe(1);
  });

  it('combines multiple selected values within one option group and multiple groups together', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock);

    fixture.componentInstance.toggleOption('Size', 'S');
    fixture.detectChanges();
    flushBoth(httpMock);

    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    flushBoth(httpMock);

    fixture.componentInstance.toggleOption('Color', 'Black');
    fixture.detectChanges();

    const req = expectProductListRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCT_LIST',
      locationId: 18,
      categoryId: 5510,
      optionFilters: 'Size:S,M;Color:Black',
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE_LIST);
    expectProductFacetsRequest(httpMock).flush(SAMPLE_FACETS);
  });

  it('should clear only one option group, leaving the other selected, reset to page 1, and refetch', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock);

    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    flushBoth(httpMock);
    fixture.componentInstance.toggleOption('Color', 'Black');
    fixture.detectChanges();
    flushBoth(httpMock);

    fixture.componentInstance.goToPage(2);
    fixture.detectChanges();
    expectProductListRequest(httpMock).flush({ ...SAMPLE_LIST, page: 2 });
    expectNoProductFacetsRequest(httpMock);

    fixture.componentInstance.clearOptionFilter('Size');
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedOptions()['Size']).toEqual([]);
    expect(fixture.componentInstance.selectedOptions()['Color']).toEqual(['Black']);
    expect(fixture.componentInstance.page()).toBe(1);

    const req = expectProductListRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCT_LIST',
      locationId: 18,
      categoryId: 5510,
      optionFilters: 'Color:Black',
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE_LIST);
    expectProductFacetsRequest(httpMock).flush(SAMPLE_FACETS);
  });

  it('should freeze the sidebar option facets once a filter is applied, instead of letting the narrowed response reshuffle them', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock);

    // SAMPLE_FACETS lists Size then Color, but Color sorts ahead of Size.
    const expectedSorted = [SAMPLE_FACETS.optionFacets[1], SAMPLE_FACETS.optionFacets[0]];
    expect(fixture.componentInstance.optionFacets()).toEqual(expectedSorted);

    // Once size M is selected, the backend narrows the facets it returns —
    // the sidebar should keep showing the original (unfiltered) set rather
    // than reshuffling to match this narrowed response.
    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    flushBoth(httpMock, undefined, {
      optionFacets: [{ optionName: 'Size', values: [{ value: 'M', valueCode: '', count: 3 }] }],
    });

    expect(fixture.componentInstance.optionFacets()).toEqual(expectedSorted);

    // Clearing the filter goes back to an unfiltered request — facets
    // refresh again at that point.
    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    flushBoth(httpMock, undefined, {
      optionFacets: [{ optionName: 'Size', values: [{ value: 'L', valueCode: '', count: 5 }] }],
    });

    expect(fixture.componentInstance.optionFacets()).toEqual([
      { optionName: 'Size', values: [{ value: 'L', valueCode: '', count: 5 }] },
    ]);
  });

  it('should move "Color" and "Size" option groups to the front, Color ahead of Size, wherever the backend placed them', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock, undefined, {
      optionFacets: [
        { optionName: 'Body', values: [{ value: 'Reg', valueCode: '', count: 2 }] },
        { optionName: 'Size', values: [{ value: 'M', valueCode: '', count: 9 }] },
        { optionName: 'Fit', values: [{ value: 'Slim', valueCode: '', count: 4 }] },
        { optionName: 'Color', values: [{ value: 'Black', valueCode: '#0B0B0B', count: 7 }] },
      ],
    });

    expect(fixture.componentInstance.optionFacets().map((group) => group.optionName)).toEqual([
      'Color',
      'Size',
      'Body',
      'Fit',
    ]);
  });

  it('should move "Size" to the front and NOT match look-alike groups like "Product Size" or "Body/Sleeve"', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock, undefined, {
      optionFacets: [
        { optionName: 'Body', values: [{ value: 'Reg', valueCode: '', count: 2 }] },
        { optionName: 'Body/Sleeve', values: [{ value: 'Long', valueCode: '', count: 2 }] },
        { optionName: 'Inseam', values: [{ value: 'Reg', valueCode: '', count: 5 }] },
        { optionName: 'Product Size', values: [{ value: '10', valueCode: '', count: 3 }] },
        { optionName: 'Size', values: [{ value: 'M', valueCode: '', count: 9 }] },
        { optionName: 'Width', values: [{ value: 'Wide', valueCode: '', count: 4 }] },
      ],
    });

    expect(fixture.componentInstance.optionFacets().map((group) => group.optionName)).toEqual([
      'Size',
      'Body',
      'Body/Sleeve',
      'Inseam',
      'Product Size',
      'Width',
    ]);
  });

  it('should match "Size" even with stray leading/trailing whitespace or different casing from the backend', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock, undefined, {
      optionFacets: [
        { optionName: 'Body', values: [{ value: 'Reg', valueCode: '', count: 2 }] },
        { optionName: ' SIZE ', values: [{ value: 'M', valueCode: '', count: 9 }] },
      ],
    });

    expect(fixture.componentInstance.optionFacets().map((group) => group.optionName)).toEqual([
      ' SIZE ',
      'Body',
    ]);
  });

  it('should leave the group order alone when neither "Color" nor "Size" is present', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock, undefined, {
      optionFacets: [
        { optionName: 'Body', values: [{ value: 'Reg', valueCode: '', count: 2 }] },
        { optionName: 'Fit', values: [{ value: 'Slim', valueCode: '', count: 4 }] },
      ],
    });

    expect(fixture.componentInstance.optionFacets().map((group) => group.optionName)).toEqual([
      'Body',
      'Fit',
    ]);
  });

  it('should collapse every option group but the first (post Color-then-Size sort) by default', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock, undefined, {
      optionFacets: [
        { optionName: 'Body', values: [{ value: 'Reg', valueCode: '', count: 2 }] },
        { optionName: 'Size', values: [{ value: 'M', valueCode: '', count: 9 }] },
        { optionName: 'Color', values: [{ value: 'Black', valueCode: '#0B0B0B', count: 7 }] },
      ],
    });

    // Color sorts first, so it's the only one left expanded.
    expect(fixture.componentInstance.collapsedGroups().has('Color')).toBe(false);
    expect(fixture.componentInstance.collapsedGroups().has('Size')).toBe(true);
    expect(fixture.componentInstance.collapsedGroups().has('Body')).toBe(true);
  });

  it('should toggle a group between collapsed and expanded', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock);

    // Color outranks Size in the sort priority, so with both present here,
    // Color is the one left expanded and Size is the one collapsed.
    expect(fixture.componentInstance.collapsedGroups().has('Size')).toBe(true);

    fixture.componentInstance.toggleGroupCollapsed('Size');
    expect(fixture.componentInstance.collapsedGroups().has('Size')).toBe(false);

    fixture.componentInstance.toggleGroupCollapsed('Size');
    expect(fixture.componentInstance.collapsedGroups().has('Size')).toBe(true);
  });

  it('should reset the selected option filters when the category/search scope changes', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock);

    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    flushBoth(httpMock);
    expect(fixture.componentInstance.selectedOptions()['Size']).toEqual(['M']);

    fixture.componentRef.setInput('categoryId', '321');
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedOptions()).toEqual({});
    const req = expectProductListRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCT_LIST',
      locationId: 18,
      categoryId: 321,
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE_LIST);
    expectProductFacetsRequest(httpMock).flush(SAMPLE_FACETS);
  });

  it('should scroll the results back into view when toggling an option filter', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock);

    // jsdom (used here) doesn't implement scrollIntoView at all — stub it
    // the way a real browser's version would exist, so the component can
    // find and call it.
    const resultsTop = fixture.nativeElement.querySelector('.results-top') as HTMLElement;
    const scrollIntoViewSpy = vi.fn();
    resultsTop.scrollIntoView = scrollIntoViewSpy;

    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    flushBoth(httpMock);

    scrollIntoViewSpy.mockClear();
    fixture.componentInstance.toggleOption('Color', 'Black');
    fixture.detectChanges();
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    flushBoth(httpMock);
  });

  it('should paginate', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock);

    fixture.componentInstance.goToPage(2);
    fixture.detectChanges();

    const req = expectProductListRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCT_LIST',
      locationId: 18,
      categoryId: 5510,
      page: 2,
      pageSize: 24,
    });
    req.flush({ ...SAMPLE_LIST, page: 2 });
    expectNoProductFacetsRequest(httpMock);

    expect(fixture.componentInstance.page()).toBe(2);
  });

  it('should scroll the results back into view when changing page', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    flushBoth(httpMock);

    // jsdom (used here) doesn't implement scrollIntoView at all — stub it
    // the way a real browser's version would exist, so goToPage() can find
    // and call it.
    const resultsTop = fixture.nativeElement.querySelector('.results-top') as HTMLElement;
    const scrollIntoViewSpy = vi.fn();
    resultsTop.scrollIntoView = scrollIntoViewSpy;

    fixture.componentInstance.goToPage(2);

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('should show an error message when the request fails', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    expectProductListRequest(httpMock).flush('failure', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'We could not load products right now.',
    );
  });

  it('should not blank the grid when only the facets request fails', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      ...FAKE_SESSION,
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    expectProductListRequest(httpMock).flush(SAMPLE_LIST);
    expectProductFacetsRequest(httpMock).flush('failure', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sworn duty shirt, long sleeve');
    expect(fixture.nativeElement.textContent).not.toContain('We could not load products right now.');
  });
});
