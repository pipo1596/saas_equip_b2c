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
      colors: [{ valueDesc: 'Black', valueCode: '#0B0B0B' }],
    },
  ],
  totalCount: 32,
  page: 1,
  pageSize: 24,
  categoryFacets: [{ progCatId: 5510, categoryName: 'Long sleeve', count: 14 }],
  sizeFacets: [{ value: 'M', count: 9 }],
  colorFacets: [{ value: 'Black', valueCode: '#0B0B0B', count: 7 }],
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

describe('ProductList', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ProductList],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

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

  it('should toggle a size filter, reset to page 1, and refetch with it included', () => {
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

    fixture.componentInstance.toggleSize('M');
    fixture.detectChanges();

    const req = expectProductsRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      categoryId: 5510,
      sizes: ['M'],
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE);
    expect(fixture.componentInstance.page()).toBe(1);
  });

  it('should clear only the size filter, leaving color selected, reset to page 1, and refetch', () => {
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

    fixture.componentInstance.toggleSize('M');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);
    fixture.componentInstance.toggleColor('Black');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    fixture.componentInstance.goToPage(2);
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({ ...SAMPLE, page: 2 });

    fixture.componentInstance.clearSizeFilter();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedSizes()).toEqual([]);
    expect(fixture.componentInstance.selectedColors()).toEqual(['Black']);
    expect(fixture.componentInstance.page()).toBe(1);

    const req = expectProductsRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      categoryId: 5510,
      colors: ['Black'],
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE);
  });

  it('should clear only the color filter, leaving size selected, reset to page 1, and refetch', () => {
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

    fixture.componentInstance.toggleSize('M');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);
    fixture.componentInstance.toggleColor('Black');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);

    fixture.componentInstance.goToPage(2);
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({ ...SAMPLE, page: 2 });

    fixture.componentInstance.clearColorFilter();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedColors()).toEqual([]);
    expect(fixture.componentInstance.selectedSizes()).toEqual(['M']);
    expect(fixture.componentInstance.page()).toBe(1);

    const req = expectProductsRequest(httpMock);
    expect(req.request.body).toEqual({
      action: '*PRODUCTS',
      locationId: 18,
      categoryId: 5510,
      sizes: ['M'],
      page: 1,
      pageSize: 24,
    });
    req.flush(SAMPLE);
  });

  it('should freeze the sidebar facets once a filter is applied, instead of letting the narrowed response reshuffle them', () => {
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

    expect(fixture.componentInstance.sizeFacets()).toEqual(SAMPLE.sizeFacets);

    // Once size M is selected, the backend narrows the facets it returns —
    // the sidebar should keep showing the original (unfiltered) set rather
    // than reshuffling to match this narrowed response.
    fixture.componentInstance.toggleSize('M');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({
      ...SAMPLE,
      sizeFacets: [{ value: 'M', count: 3 }],
      colorFacets: [],
    });

    expect(fixture.componentInstance.sizeFacets()).toEqual(SAMPLE.sizeFacets);
    expect(fixture.componentInstance.colorFacets()).toEqual(SAMPLE.colorFacets);

    // Clearing the filter goes back to an unfiltered request — facets
    // refresh again at that point.
    fixture.componentInstance.toggleSize('M');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush({
      ...SAMPLE,
      sizeFacets: [{ value: 'L', count: 5 }],
    });

    expect(fixture.componentInstance.sizeFacets()).toEqual([{ value: 'L', count: 5 }]);
  });

  it('should reset the selected filters when the category/search scope changes', () => {
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

    fixture.componentInstance.toggleSize('M');
    fixture.detectChanges();
    expectProductsRequest(httpMock).flush(SAMPLE);
    expect(fixture.componentInstance.selectedSizes()).toEqual(['M']);

    fixture.componentRef.setInput('categoryId', '321');
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedSizes()).toEqual([]);
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

  it('should scroll the results back into view when toggling a size or color filter', () => {
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

    fixture.componentInstance.toggleSize('M');
    fixture.detectChanges();
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expectProductsRequest(httpMock).flush(SAMPLE);

    scrollIntoViewSpy.mockClear();
    fixture.componentInstance.toggleColor('Black');
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
