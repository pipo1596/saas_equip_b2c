import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../../core/auth/auth';
import { ProductSearchResult } from '../../../core/catalog/catalog-products';
import { ProductList } from './product-list';

const LOCATIONS = [
  { empLocId: 14998, locationId: 18, locationCode: '004', locationName: 'Edmonton Fire Dept Chief' },
];

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
        { valueDesc: 'Black', valueCode: 'BLACK', valueSwtchColor: 'black', valueSwtchImage: '' },
      ],
    },
  ],
  totalCount: 32,
  page: 1,
  pageSize: 24,
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

// `<app-header/>` is rendered by this page and independently hits the exact
// same SEPGM (APCTPCVEW, action *MENU) once a location is active, and also
// APCTPSTNGS for tenant settings — so a plain `expectOne(url)` can't tell
// the products call apart from the header's own incidental one.
function expectProductsRequest(httpMock: HttpTestingController): TestRequest {
  const matches = httpMock.match(
    (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCVEW' && req.body?.action === '*PRODUCTS',
  );
  expect(matches.length).toBe(1);
  return matches[0];
}

// This page also loads the same leaf-category list the Home page's "Shop by
// category" carousel uses, to know which categoryFacets are actual leaf
// categories worth listing (vs. a parent/group node in the same facet set).
function expectCategoriesRequest(httpMock: HttpTestingController): TestRequest {
  const matches = httpMock.match(
    (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCVEW' && req.body?.action === '*CATEGORIES',
  );
  expect(matches.length).toBe(1);
  return matches[0];
}

function categoryFacetNames(fixture: { nativeElement: HTMLElement }): string[] {
  return Array.from(fixture.nativeElement.querySelectorAll('.facet-link')).map((link) =>
    link.querySelector('span')!.textContent!.trim(),
  );
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
        (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPCVEW' && req.body?.action === '*PRODUCTS',
      ),
    ).toHaveLength(0);
  });

  it('should query by numeric category id', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    const req = expectProductsRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      categoryId: 5510,
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE);
  });

  it('should link each product card to its product detail page', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.product-card');
    expect(card.tagName).toBe('A');
    expect(card.getAttribute('href')).toBe('/product/4021?name=Sworn%20duty%20shirt,%20long%20sleeve');
  });

  it("should render a color swatch using the color's own swatch color", () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);
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
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({
      ...SAMPLE,
      products: [
        {
          ...SAMPLE.products[0],
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
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    const req = expectProductsRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      bucket: 'FOOTWEAR',
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE);
  });

  it('should query the full catalog with neither categoryId nor bucket for "full-catalog"', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', 'full-catalog');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    const req = expectProductsRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE);
  });

  it('should query by search keyword when q is set and no categoryId is bound', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('q', 'steel toe boots');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    const req = expectProductsRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      search: 'steel toe boots',
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE);
  });

  it('should render the returned products, count, and facets', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    expectProductsRequest(httpMock).flush(SAMPLE);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('32 products');
    expect(text).toContain('Sworn duty shirt, long sleeve');
    expect(text).toContain('Long sleeve');
    expect(fixture.componentInstance.totalPages()).toBe(2);
  });

  it('should toggle an option filter, reset to page 1, and refetch with a flattened optionFilters string', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    fixture.componentInstance.goToPage(2);
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();

    const req = expectProductsRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      categoryId: 5510,
      optionFilters: 'Size:M',
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE);
    expect(fixture.componentInstance.page()).toBe(1);
  });

  it('combines multiple selected values within one option group and multiple groups together', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    fixture.componentInstance.toggleOption('Size', 'S');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    fixture.componentInstance.toggleOption('Color', 'Black');
    fixture.detectChanges();

    const req = expectProductsRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      categoryId: 5510,
      optionFilters: 'Size:S,M;Color:Black',
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE);
  });

  it('should clear only one option group, leaving the other selected, reset to page 1, and refetch', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);
    fixture.componentInstance.toggleOption('Color', 'Black');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    fixture.componentInstance.goToPage(2);
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({ ...SAMPLE, page: 2 });

    fixture.componentInstance.clearOptionFilter('Size');
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedOptions()['Size']).toEqual([]);
    expect(fixture.componentInstance.selectedOptions()['Color']).toEqual(['Black']);
    expect(fixture.componentInstance.page()).toBe(1);

    const req = expectProductsRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      categoryId: 5510,
      optionFilters: 'Color:Black',
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE);
  });

  it('should freeze the sidebar option facets once a filter is applied, instead of letting the narrowed response reshuffle them', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    // SAMPLE lists Size then Color, but Color sorts ahead of Size.
    const expectedSorted = [SAMPLE.optionFacets[1], SAMPLE.optionFacets[0]];
    expect(fixture.componentInstance.optionFacets()).toEqual(expectedSorted);

    // Once size M is selected, the backend narrows the facets it returns —
    // the sidebar should keep showing the original (unfiltered) set rather
    // than reshuffling to match this narrowed response.
    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({
      ...SAMPLE,
      optionFacets: [{ optionName: 'Size', values: [{ value: 'M', valueCode: '', count: 3 }] }],
    });

    expect(fixture.componentInstance.optionFacets()).toEqual(expectedSorted);

    // Clearing the filter goes back to an unfiltered request — facets
    // refresh again at that point.
    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({
      ...SAMPLE,
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
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({
      ...SAMPLE,
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
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({
      ...SAMPLE,
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
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({
      ...SAMPLE,
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
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({
      ...SAMPLE,
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
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({
      ...SAMPLE,
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
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    // Color outranks Size in the sort priority, so with both present here,
    // Color is the one left expanded and Size is the one collapsed.
    expect(fixture.componentInstance.collapsedGroups().has('Size')).toBe(true);

    fixture.componentInstance.toggleGroupCollapsed('Size');
    expect(fixture.componentInstance.collapsedGroups().has('Size')).toBe(false);

    fixture.componentInstance.toggleGroupCollapsed('Size');
    expect(fixture.componentInstance.collapsedGroups().has('Size')).toBe(true);
  });

  it('should always refresh categoryFacets, since its counts are unaffected by optionFilters', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    const updatedCategoryFacets = [{ progCatId: 5510, categoryName: 'Long sleeve', count: 3 }];
    expectProductsRequest(httpMock).flush({ ...SAMPLE, categoryFacets: updatedCategoryFacets });

    expect(fixture.componentInstance.categoryFacets()).toEqual(updatedCategoryFacets);
  });

  it('should only list category facets with a positive count that are also leaf categories', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', 'full-catalog');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    expectProductsRequest(httpMock).flush({
      ...SAMPLE,
      categoryFacets: [
        // A parent/group node with no products of its own directly in it.
        { progCatId: 100, categoryName: 'Apparel', count: 0 },
        // A parent/group node that does carry a count, but isn't itself a
        // leaf category shoppers can browse into.
        { progCatId: 200, categoryName: 'Accessory', count: 12 },
        { progCatId: 5510, categoryName: 'Long sleeve', count: 14 },
      ],
    });
    expectCategoriesRequest(httpMock).flush({
      categories: [
        { progCatId: 5510, categoryName: 'Long sleeve', productCount: 14, imageUrl: '' },
      ],
    });
    fixture.detectChanges();

    expect(categoryFacetNames(fixture)).toEqual(['Long sleeve']);
  });

  it('should show every category facet with a positive count while the leaf category list is still loading', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', 'full-catalog');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    expectProductsRequest(httpMock).flush({
      ...SAMPLE,
      categoryFacets: [
        { progCatId: 100, categoryName: 'Apparel', count: 0 },
        { progCatId: 200, categoryName: 'Accessory', count: 12 },
        { progCatId: 5510, categoryName: 'Long sleeve', count: 14 },
      ],
    });
    fixture.detectChanges();

    expect(categoryFacetNames(fixture)).toEqual(['Accessory', 'Long sleeve']);
  });

  it('should reset the selected option filters when the category/search scope changes', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);
    expect(fixture.componentInstance.selectedOptions()['Size']).toEqual(['M']);

    fixture.componentRef.setInput('categoryId', '321');
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedOptions()).toEqual({});
    const req = expectProductsRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      categoryId: 321,
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE);
  });

  it('should scroll the results back into view when toggling an option filter', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    // jsdom (used here) doesn't implement scrollIntoView at all — stub it
    // the way a real browser's version would exist, so the component can
    // find and call it.
    const resultsTop = fixture.nativeElement.querySelector('.results-top') as HTMLElement;
    const scrollIntoViewSpy = vi.fn();
    resultsTop.scrollIntoView = scrollIntoViewSpy;

    fixture.componentInstance.toggleOption('Size', 'M');
    fixture.detectChanges();
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expectProductsRequest(httpMock).flush(SAMPLE);

    scrollIntoViewSpy.mockClear();
    fixture.componentInstance.toggleOption('Color', 'Black');
    fixture.detectChanges();
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expectProductsRequest(httpMock).flush(SAMPLE);
  });

  it('should paginate', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    fixture.componentInstance.goToPage(2);
    fixture.detectChanges();

    const req = expectProductsRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      categoryId: 5510,
      page: 2,
      pageSize: 24,
    });
    req.flush({ ...SAMPLE, page: 2 });

    expect(fixture.componentInstance.page()).toBe(2);
  });

  it('should scroll the results back into view when changing page', () => {
    const fixture = TestBed.createComponent(ProductList);
    const auth = TestBed.inject(AuthService);
    fixture.componentRef.setInput('categoryId', '5510');
    auth.session.set({
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

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
      empId: '1',
      sessionId: 's',
      firstName: 'P',
      lastName: 'A',
      locations: LOCATIONS,
    });
    fixture.detectChanges();

    expectProductsRequest(httpMock).flush('failure', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'We could not load products right now.',
    );
  });
});
