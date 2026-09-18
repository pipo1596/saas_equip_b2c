import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { CartService } from '../../../core/cart/cart';
import { ProductDetailInfo } from '../../../core/catalog/product-detail';
import { ProductDetail } from './product-detail';

const PRODUCT: ProductDetailInfo = {
  productPk: 12345,
  productId: 'ABC-100',
  handle: 'mens-trail-jacket',
  title: "Men's Trail Jacket",
  descr: 'Short marketing blurb',
  longDescr: '',
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
};

// `*GET` no longer ships a SKU matrix — just the header, images, and every
// option value starting enabled.
const RESPONSE = {
  product: PRODUCT,
  images: [{ imageId: 1, skuId: null, imageUrl: 'https://cdn.example.com/hero.jpg', imageType: 'gallery', imageDesc: '', sortOrder: 0 }],
  options: [
    { optId: 101, optName: 'Color', optOrder: 1, valueCode: '#000000', valueDesc: 'Black', swatchColor: '#000000', swatchImg: '', valSeq: 1 },
    { optId: 102, optName: 'Color', optOrder: 1, valueCode: '#FFFFFF', valueDesc: 'White', swatchColor: '#FFFFFF', swatchImg: '', valSeq: 2 },
    { optId: 201, optName: 'Size', optOrder: 2, valueCode: '', valueDesc: 'M', swatchColor: '', swatchImg: '', valSeq: 1 },
    { optId: 202, optName: 'Size', optOrder: 2, valueCode: '', valueDesc: 'L', swatchColor: '', swatchImg: '', valSeq: 2 },
  ],
};

const AVAIL_EVERYTHING = {
  resolvedSkuId: null,
  axes: [
    { optName: 'Color', optOrder: 1, availableOptIds: [101, 102] },
    { optName: 'Size', optOrder: 2, availableOptIds: [201, 202] },
  ],
};

const WHITE_M_SKU = {
  skuId: 9002,
  productPk: 12345,
  skuCode: 'ABC-100-WHT-M',
  basePrice: 94.99,
  comparePrice: 110,
  msrp: 110,
  weight: 1.2,
  weightUnit: 'lb',
  isDefault: 'N',
  requiresShip: 'Y',
  isTaxable: 'Y',
  variantImageUrl: '',
};

function expectRequest(httpMock: HttpTestingController, action: string) {
  const matches = httpMock.match(
    (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCPRDDTL' && req.body?.action === action,
  );
  expect(matches.length).toBe(1);
  return matches[0];
}

// `<app-header/>` (rendered by this page too) independently fires its own
// `*GET` against this exact same SEPGM/URL on init, via the shared
// `CartService` singleton — filter by action, not just URL, to tell it
// apart from this test's own `*ADD_ITEM`/etc. call.
function expectCartRequest(httpMock: HttpTestingController, action: string) {
  const matches = httpMock.match(
    (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART' && req.body?.action === action,
  );
  expect(matches.length).toBe(1);
  return matches[0];
}

function countRequests(httpMock: HttpTestingController, action: string): number {
  return httpMock.match(
    (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCPRDDTL' && req.body?.action === action,
  ).length;
}

describe('ProductDetail', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    // `<app-header/>`/`<app-footer/>` restore a session from localStorage,
    // which (unlike TestBed's DI container) isn't reset between spec files.
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ProductDetail],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should scroll to the top of the page on first render', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    // jsdom doesn't implement scrollIntoView at all — stub it so we can
    // assert it gets called, same pattern used for the product list page.
    const scrollIntoViewSpy = vi.fn();
    fixture.nativeElement.scrollIntoView = scrollIntoViewSpy;

    fixture.detectChanges();

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('should fall back to a generic title when no product name is bound', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1').textContent.trim()).toBe('Product');
  });

  it('should not throw when scrolling the thumbnail carousel before it renders', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    expect(() => fixture.componentInstance.scrollThumbs(1)).not.toThrow();
  });

  it('should show the name passed in the query param immediately, before the API responds', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.componentRef.setInput('name', "Men's Trail Jacket");
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1').textContent.trim()).toBe("Men's Trail Jacket");
    expectRequest(httpMock, '*GET').flush(RESPONSE);
  });

  it('should show the vendor name but no logo image when brandLogoUrl is empty', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.product-detail__brand-logo')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Acme Outdoor');
  });

  it('should show the product id', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('ABC-100');
  });

  it('should show the construction text below the full description', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      product: {
        ...PRODUCT,
        longDescr: '<p>Full description</p>',
        construction: '4.76 oz 100% Tough Cotton\nYKK Locking Zippers',
      },
    });
    fixture.detectChanges();

    const headingEls: HTMLHeadingElement[] = fixture.nativeElement.querySelectorAll(
      '.product-detail__section-title',
    );
    const headings = Array.from(headingEls).map((h) => h.textContent);
    expect(headings).toEqual(['Details', 'Construction']);
    expect(fixture.nativeElement.querySelector('.product-detail__construction').textContent).toContain(
      'YKK Locking Zippers',
    );
  });

  it('should show a Construction section on its own when there is no full description', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      product: { ...PRODUCT, longDescr: '', construction: 'Melamine buttons' },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Construction');
    expect(fixture.nativeElement.textContent).toContain('Melamine buttons');
  });

  it('should not render the details card at all when neither longDescr nor construction is set', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      product: { ...PRODUCT, longDescr: '', construction: '' },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.product-detail__section-title')).toBeNull();
  });

  it('should show the returned attributes as a spec list', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      attributes: [
        { attrId: 14, attrName: 'attrib1', attrValue: 'value1' },
        { attrId: 15, attrName: 'attrib2', attrValue: 'value2' },
      ],
    });
    fixture.detectChanges();

    const terms: HTMLElement[] = fixture.nativeElement.querySelectorAll('.product-detail__attributes dt');
    const values: HTMLElement[] = fixture.nativeElement.querySelectorAll('.product-detail__attributes dd');
    expect(Array.from(terms).map((el) => el.textContent)).toEqual(['attrib1', 'attrib2']);
    expect(Array.from(values).map((el) => el.textContent)).toEqual(['value1', 'value2']);
  });

  it('should not show the specifications section when there are no attributes', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.product-detail__attributes')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Specifications');
  });

  it('should show the brand logo image when brandLogoUrl is returned', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      product: { ...PRODUCT, brandLogoUrl: 'https://cdn.example.com/acme-logo.png' },
    });
    fixture.detectChanges();

    const logo: HTMLImageElement = fixture.nativeElement.querySelector('.product-detail__brand-logo');
    expect(logo.src).toBe('https://cdn.example.com/acme-logo.png');
    expect(logo.alt).toBe('Acme');
  });

  it('should not fetch anything when no productPk is bound', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.detectChanges();

    expect(httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCPRDDTL')).toHaveLength(0);
  });

  it('should check availability with an empty selection on first load, and prompt for a pick before showing price', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();

    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();

    expect(detail.product()?.title).toBe("Men's Trail Jacket");
    expect(detail.selections()).toEqual({});

    const availReq = expectRequest(httpMock, '*AVAIL');
    expect(availReq.request.body).toEqual({ action: '*AVAIL', productPk: 12345, selections: [] });
    availReq.flush(AVAIL_EVERYTHING);
    fixture.detectChanges();

    expect(detail.resolvedSku()).toBeNull();
    expect(countRequests(httpMock, '*GET_SKU')).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Select options to see the exact price.');
    expect(fixture.nativeElement.textContent).toContain('$79.99');
    expect(fixture.nativeElement.textContent).toContain('$94.99');
  });

  it('should show a single price, not a range, when every sku shares the same price', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      product: { ...PRODUCT, minPrice: 89.99, maxPrice: 89.99 },
    });
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush(AVAIL_EVERYTHING);
    fixture.detectChanges();

    const priceEl = fixture.nativeElement.querySelector('.product-detail__price');
    expect(priceEl.textContent.trim()).toBe('$89.99');
  });

  it('should fall back to the generic prompt (no range shown) when the product has no price range yet', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      product: { ...PRODUCT, minPrice: null, maxPrice: null },
    });
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush(AVAIL_EVERYTHING);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.product-detail__price')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Select options to see price and availability.');
  });

  it('should still check availability (and resolve straight to a sku) for a product with no options at all', () => {
    // A zero-axis "selection" is trivially complete, so a single-SKU
    // product with nothing to pick should resolve immediately, not get
    // stuck showing "Select options to see price" forever.
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();

    expectRequest(httpMock, '*GET').flush({ ...RESPONSE, options: [] });
    fixture.detectChanges();
    expect(detail.axes()).toEqual([]);

    const availReq = expectRequest(httpMock, '*AVAIL');
    expect(availReq.request.body).toEqual({ action: '*AVAIL', productPk: 12345, selections: [] });
    availReq.flush({ resolvedSkuId: 9001, axes: [] });
    fixture.detectChanges();

    expect(detail.resolvedSkuId()).toBe(9001);
    const skuReq = expectRequest(httpMock, '*GET_SKU');
    expect(skuReq.request.body).toEqual({ action: '*GET_SKU', skuId: 9001 });
    skuReq.flush({ ...WHITE_M_SKU, skuId: 9001, skuCode: 'ABC-100-ONLY' });
    fixture.detectChanges();

    expect(detail.resolvedSku()?.skuCode).toBe('ABC-100-ONLY');
    expect(fixture.nativeElement.textContent).not.toContain('Select options to see price');
  });

  it('should re-check availability on every pick and fetch the sku once one resolves', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush(AVAIL_EVERYTHING);
    fixture.detectChanges();

    detail.selectOption('Color', 102);
    detail.selectOption('Size', 201);
    fixture.detectChanges();

    const availReq = expectRequest(httpMock, '*AVAIL');
    expect(availReq.request.body).toEqual({
      action: '*AVAIL',
      productPk: 12345,
      selections: [{ optId: 102 }, { optId: 201 }],
    });
    availReq.flush({
      resolvedSkuId: 9002,
      axes: [
        { optName: 'Color', optOrder: 1, availableOptIds: [102] },
        { optName: 'Size', optOrder: 2, availableOptIds: [201] },
      ],
    });
    fixture.detectChanges();

    expect(detail.resolvedSkuId()).toBe(9002);
    const skuReq = expectRequest(httpMock, '*GET_SKU');
    expect(skuReq.request.body).toEqual({ action: '*GET_SKU', skuId: 9002 });
    skuReq.flush(WHITE_M_SKU);
    fixture.detectChanges();

    expect(detail.resolvedSku()?.skuCode).toBe('ABC-100-WHT-M');
    expect(fixture.nativeElement.textContent).toContain('$94.99');
  });

  it('should keep showing the previous sku (and an enabled "Add to Cart") while switching straight to a new resolved sku, instead of flashing through the unresolved state', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush(AVAIL_EVERYTHING);
    fixture.detectChanges();

    // Resolve to Black + M first.
    detail.selectOption('Color', 101);
    detail.selectOption('Size', 201);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush({
      resolvedSkuId: 9001,
      axes: [
        { optName: 'Color', optOrder: 1, availableOptIds: [101] },
        { optName: 'Size', optOrder: 2, availableOptIds: [201] },
      ],
    });
    fixture.detectChanges();
    expectRequest(httpMock, '*GET_SKU').flush({ ...WHITE_M_SKU, skuId: 9001, skuCode: 'ABC-100-BLK-M', basePrice: 89.99 });
    fixture.detectChanges();
    expect(detail.resolvedSku()?.skuCode).toBe('ABC-100-BLK-M');

    // Switch straight to White + M — the *AVAIL and *GET_SKU round trips are
    // both still in flight at this point (neither has been flushed yet).
    detail.selectOption('Color', 102);
    fixture.detectChanges();

    expect(detail.resolvedSku()?.skuCode).toBe('ABC-100-BLK-M');
    expect(detail.canAddToCart()).toBe(true);
    expect(fixture.nativeElement.querySelector('.btn-add-to-cart').disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('$89.99');

    expectRequest(httpMock, '*AVAIL').flush({
      resolvedSkuId: 9002,
      axes: [
        { optName: 'Color', optOrder: 1, availableOptIds: [102] },
        { optName: 'Size', optOrder: 2, availableOptIds: [201] },
      ],
    });
    fixture.detectChanges();

    // *GET_SKU for the new sku hasn't resolved yet either — still showing
    // the old sku rather than having blanked out in between.
    expect(detail.resolvedSku()?.skuCode).toBe('ABC-100-BLK-M');
    expect(detail.canAddToCart()).toBe(true);

    expectRequest(httpMock, '*GET_SKU').flush(WHITE_M_SKU);
    fixture.detectChanges();

    expect(detail.resolvedSku()?.skuCode).toBe('ABC-100-WHT-M');
    expect(detail.canAddToCart()).toBe(true);
  });

  it("should show the clicked photo and pick its color immediately, not the previous sku's stale variant image, while a new selection is still resolving", () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      images: [
        { imageId: 1, skuId: 9001, imageUrl: 'https://cdn.example.com/black.jpg', imageType: 'large', imageDesc: '', sortOrder: 0, optionIds: [101] },
        { imageId: 2, skuId: 9002, imageUrl: 'https://cdn.example.com/white.jpg', imageType: 'large', imageDesc: '', sortOrder: 0, optionIds: [102] },
      ],
    });
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush(AVAIL_EVERYTHING);
    fixture.detectChanges();

    // Resolve fully to Black + M, whose sku carries its own variant photo.
    detail.selectOption('Color', 101);
    detail.selectOption('Size', 201);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush({
      resolvedSkuId: 9001,
      axes: [
        { optName: 'Color', optOrder: 1, availableOptIds: [101] },
        { optName: 'Size', optOrder: 2, availableOptIds: [201] },
      ],
    });
    fixture.detectChanges();
    expectRequest(httpMock, '*GET_SKU').flush({
      ...WHITE_M_SKU,
      skuId: 9001,
      skuCode: 'ABC-100-BLK-M',
      variantImageUrl: 'https://cdn.example.com/black-variant.jpg',
    });
    fixture.detectChanges();
    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/black-variant.jpg');

    // Now click the White photo — the new *AVAIL/*GET_SKU round trip for
    // this pick hasn't resolved yet, so `resolvedSku()` is still Black's
    // (stale) sku record with its own variantImageUrl.
    const thumbs: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.product-detail__thumb');
    thumbs[1].click();
    fixture.detectChanges();

    expect(detail.selections()['Color']).toBe(102);
    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/white.jpg');
  });

  it('should keep "Add to Cart" disabled until a sku is fully resolved', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush(AVAIL_EVERYTHING);
    fixture.detectChanges();

    expect(detail.canAddToCart()).toBe(false);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-add-to-cart');
    expect(button.disabled).toBe(true);
  });

  it('should enable "Add to Cart" once a sku resolves, and add it on click', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush(AVAIL_EVERYTHING);
    fixture.detectChanges();

    detail.selectOption('Color', 102);
    detail.selectOption('Size', 201);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush({
      resolvedSkuId: 9002,
      axes: [
        { optName: 'Color', optOrder: 1, availableOptIds: [102] },
        { optName: 'Size', optOrder: 2, availableOptIds: [201] },
      ],
    });
    fixture.detectChanges();
    expectRequest(httpMock, '*GET_SKU').flush(WHITE_M_SKU);
    fixture.detectChanges();

    expect(detail.canAddToCart()).toBe(true);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-add-to-cart');
    expect(button.disabled).toBe(false);

    button.click();
    fixture.detectChanges();

    expect(detail.addingToCart()).toBe(true);
    const addReq = expectCartRequest(httpMock, '*ADD_ITEM');
    expect(addReq.request.body).toEqual({ action: '*ADD_ITEM', skuId: 9002, qty: 1 });
    addReq.flush({ cartId: 501, itemCount: 1, subtotalPrice: 94.99, subtotalPoints: null, items: [] });
    fixture.detectChanges();

    expect(detail.addingToCart()).toBe(false);
    expect(detail.addedToCart()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Added to cart.');
    // The header's own cart drawer (rendered as part of this page) pops
    // open as the real confirmation, showing the line that was just added.
    expect(TestBed.inject(CartService).drawerOpen()).toBe(true);
  });

  it('should surface the API message when adding to cart fails', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush(AVAIL_EVERYTHING);
    fixture.detectChanges();

    detail.selectOption('Color', 102);
    detail.selectOption('Size', 201);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush({
      resolvedSkuId: 9002,
      axes: [
        { optName: 'Color', optOrder: 1, availableOptIds: [102] },
        { optName: 'Size', optOrder: 2, availableOptIds: [201] },
      ],
    });
    fixture.detectChanges();
    expectRequest(httpMock, '*GET_SKU').flush(WHITE_M_SKU);
    fixture.detectChanges();

    detail.addToCart();
    expectCartRequest(httpMock, '*ADD_ITEM').flush({
      success: false,
      message: 'That item just sold out.',
    });
    fixture.detectChanges();

    expect(detail.addingToCart()).toBe(false);
    expect(detail.addedToCart()).toBe(false);
    expect(detail.addToCartError()).toBe('That item just sold out.');
    expect(TestBed.inject(CartService).drawerOpen()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('That item just sold out.');
  });

  it('should reset the "added to cart" confirmation once the selection changes again', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush(AVAIL_EVERYTHING);
    fixture.detectChanges();

    detail.selectOption('Color', 102);
    detail.selectOption('Size', 201);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush({
      resolvedSkuId: 9002,
      axes: [
        { optName: 'Color', optOrder: 1, availableOptIds: [102] },
        { optName: 'Size', optOrder: 2, availableOptIds: [201] },
      ],
    });
    fixture.detectChanges();
    expectRequest(httpMock, '*GET_SKU').flush(WHITE_M_SKU);
    fixture.detectChanges();

    detail.addToCart();
    expectCartRequest(httpMock, '*ADD_ITEM').flush({
      cartId: 501,
      itemCount: 1,
      subtotalPrice: 94.99,
      subtotalPoints: null,
      items: [],
    });
    fixture.detectChanges();
    expect(detail.addedToCart()).toBe(true);

    detail.selectOption('Color', 102);
    expect(detail.addedToCart()).toBe(false);
  });

  it('should not go below a quantity of 1, and should keep it a whole number', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush(AVAIL_EVERYTHING);
    fixture.detectChanges();

    expect(detail.quantity()).toBe(1);
    detail.setQuantity(0);
    expect(detail.quantity()).toBe(1);
    detail.setQuantity(-5);
    expect(detail.quantity()).toBe(1);
    detail.setQuantity(3.7);
    expect(detail.quantity()).toBe(3);
    detail.setQuantity(Number.NaN);
    expect(detail.quantity()).toBe(1);
  });

  it('should disable a value once *AVAIL says it is no longer compatible', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush({
      resolvedSkuId: null,
      axes: [
        { optName: 'Color', optOrder: 1, availableOptIds: [101, 102] },
        // Nothing on Size is compatible with whatever's implied so far.
        { optName: 'Size', optOrder: 2, availableOptIds: [] },
      ],
    });
    fixture.detectChanges();

    const sizeAxis = detail.axes().find((axis) => axis.optName === 'Size')!;
    expect(detail.isOptionAvailable(sizeAxis, 201)).toBe(false);
    expect(detail.isOptionAvailable(sizeAxis, 202)).toBe(false);
  });

  it('should treat an axis missing from the *AVAIL response as fully enabled', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();

    // Nothing has resolved from `*AVAIL` yet at all.
    const colorAxis = detail.axes().find((axis) => axis.optName === 'Color')!;
    expect(detail.isOptionAvailable(colorAxis, 101)).toBe(true);
    expectRequest(httpMock, '*AVAIL').flush(AVAIL_EVERYTHING);
  });

  it('should render Color values with a swatch as a plain square button (image over color), not the text chip', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      options: [
        { optId: 101, optName: 'Color', optOrder: 1, valueCode: 'BLACK', valueDesc: 'BLACK', swatchColor: 'black', swatchImg: '', valSeq: 1 },
        { optId: 102, optName: 'Color', optOrder: 1, valueCode: 'NAVY', valueDesc: 'NAVY', swatchColor: '', swatchImg: '/photos/partner/NAVYBG.PNG', valSeq: 2 },
      ],
    });
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush({
      resolvedSkuId: null,
      axes: [{ optName: 'Color', optOrder: 1, availableOptIds: [101, 102] }],
    });
    fixture.detectChanges();

    const swatches: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.color-swatch-btn');
    expect(swatches.length).toBe(2);
    expect(swatches[0].style.background).toContain('black');
    expect(swatches[0].textContent?.trim()).toBe('');
    expect(swatches[1].style.background).toContain('/photos/partner/NAVYBG.PNG');
    expect(fixture.nativeElement.querySelectorAll('.option-chip').length).toBe(0);

    expect(swatches[0].classList).not.toContain('active');
    detail.selectOption('Color', 101);
    fixture.detectChanges();
    expect(swatches[0].classList).toContain('active');
  });

  it('should fall back to the normal text chip for a Color value with no swatch color or image', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      options: [
        { optId: 101, optName: 'Color', optOrder: 1, valueCode: 'BLACK', valueDesc: 'BLACK', swatchColor: '', swatchImg: '', valSeq: 1 },
      ],
    });
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush({
      resolvedSkuId: null,
      axes: [{ optName: 'Color', optOrder: 1, availableOptIds: [101] }],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.color-swatch-btn')).toBeNull();
    const chip = fixture.nativeElement.querySelector('.option-chip');
    expect(chip.textContent.trim()).toBe('BLACK');
  });

  it('should never use the square swatch treatment for a non-Color axis, even if it had swatch data', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      options: [
        { optId: 201, optName: 'Size', optOrder: 1, valueCode: 'M', valueDesc: 'M', swatchColor: 'red', swatchImg: '', valSeq: 1 },
      ],
    });
    fixture.detectChanges();
    expectRequest(httpMock, '*AVAIL').flush({
      resolvedSkuId: null,
      axes: [{ optName: 'Size', optOrder: 1, availableOptIds: [201] }],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.color-swatch-btn')).toBeNull();
    expect(fixture.nativeElement.querySelector('.option-chip').textContent.trim()).toBe('M');
  });

  it('should surface an availability failure inline without replacing the whole page', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();

    expectRequest(httpMock, '*AVAIL').flush({ success: false, message: 'Could not check availability.' });
    fixture.detectChanges();

    expect(detail.availabilityError()).toBe('Could not check availability.');
    expect(fixture.nativeElement.querySelector('h1').textContent.trim()).toBe("Men's Trail Jacket");
    expect(fixture.nativeElement.textContent).toContain('Could not check availability.');
  });

  it('should show every image regardless of which skuId it is tagged with', () => {
    // The real API ties every image row to *some* skuId — often the exact
    // same photo duplicated across every SKU of the product, with no
    // skuId: null "general" image at all. Filtering by the resolved skuId
    // would leave the gallery empty for most products; show them all.
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      images: [
        { imageId: 1, skuId: 9001, imageUrl: 'https://cdn.example.com/hero.jpg', imageType: 'large', imageDesc: '', sortOrder: 0 },
        { imageId: 2, skuId: 9001, imageUrl: 'https://cdn.example.com/back.jpg', imageType: 'gallery', imageDesc: '', sortOrder: 1 },
      ],
    });
    fixture.detectChanges();

    expect(detail.images().map((image) => image.imageId)).toEqual([1, 2]);
    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/hero.jpg');
  });

  it("should switch to that color's own photo when picking a color, since Color is the first axis", () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      images: [
        { imageId: 1, skuId: 9001, imageUrl: 'https://cdn.example.com/black.jpg', imageType: 'large', imageDesc: '', sortOrder: 0, optionIds: [101] },
        { imageId: 2, skuId: 9002, imageUrl: 'https://cdn.example.com/white.jpg', imageType: 'large', imageDesc: '', sortOrder: 0, optionIds: [102] },
      ],
    });
    fixture.detectChanges();
    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/black.jpg');

    detail.selectOption('Color', 102);
    fixture.detectChanges();

    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/white.jpg');
  });

  it('should pick the matching color when clicking a photo tied to a specific color', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      images: [
        { imageId: 1, skuId: 9001, imageUrl: 'https://cdn.example.com/black.jpg', imageType: 'large', imageDesc: '', sortOrder: 0, optionIds: [101] },
        { imageId: 2, skuId: 9002, imageUrl: 'https://cdn.example.com/white.jpg', imageType: 'large', imageDesc: '', sortOrder: 0, optionIds: [102] },
      ],
    });
    fixture.detectChanges();

    const thumbs: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.product-detail__thumb');
    thumbs[1].click();
    fixture.detectChanges();

    expect(detail.selections()['Color']).toBe(102);
    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/white.jpg');
  });

  it('should show the exact photo clicked, not just any photo for that color, when a color has more than one', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      images: [
        { imageId: 1, skuId: 9001, imageUrl: 'https://cdn.example.com/black-front.jpg', imageType: 'large', imageDesc: '', sortOrder: 0, optionIds: [101] },
        { imageId: 2, skuId: 9001, imageUrl: 'https://cdn.example.com/black-back.jpg', imageType: 'gallery', imageDesc: '', sortOrder: 1, optionIds: [101] },
      ],
    });
    fixture.detectChanges();
    // The color-matching fallback alone would always land on the first
    // (front) photo for this color — clicking the second one specifically
    // must stick to it instead.
    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/black-front.jpg');

    const thumbs: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.product-detail__thumb');
    thumbs[1].click();
    fixture.detectChanges();

    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/black-back.jpg');
  });

  it('should resume letting the color drive the photo once a swatch is picked again after a manual photo click', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      images: [
        { imageId: 1, skuId: 9001, imageUrl: 'https://cdn.example.com/black-front.jpg', imageType: 'large', imageDesc: '', sortOrder: 0, optionIds: [101] },
        { imageId: 2, skuId: 9001, imageUrl: 'https://cdn.example.com/black-back.jpg', imageType: 'gallery', imageDesc: '', sortOrder: 1, optionIds: [101] },
        { imageId: 3, skuId: 9002, imageUrl: 'https://cdn.example.com/white.jpg', imageType: 'large', imageDesc: '', sortOrder: 0, optionIds: [102] },
      ],
    });
    fixture.detectChanges();

    const thumbs: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.product-detail__thumb');
    thumbs[1].click();
    fixture.detectChanges();
    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/black-back.jpg');

    // Picking White via the swatch (not another photo click) should show
    // White's own photo, not stay pinned to the Black back-view photo.
    detail.selectOption('Color', 102);
    fixture.detectChanges();

    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/white.jpg');
  });

  it('should not throw when clicking a photo whose optionIds is missing entirely from the raw response', () => {
    // Defends selectImage()/colorMatchedImageUrl() directly, on top of the
    // service-level normalization, against a raw image object that omits
    // the `optionIds` key outright (not just `null`/`[]`).
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      images: [
        { imageId: 1, skuId: 9001, imageUrl: 'https://cdn.example.com/general.jpg', imageType: 'large', imageDesc: '', sortOrder: 0 },
        { imageId: 2, skuId: 9002, imageUrl: 'https://cdn.example.com/other.jpg', imageType: 'gallery', imageDesc: '', sortOrder: 1 },
      ],
    });
    fixture.detectChanges();

    const thumbs: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.product-detail__thumb');
    expect(() => thumbs[0].click()).not.toThrow();
    fixture.detectChanges();

    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/general.jpg');
    expect(detail.selections()['Color']).toBeUndefined();
  });

  it('should not sync color and image when Color is not the first axis', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      // Size first this time.
      options: [
        { optId: 201, optName: 'Size', optOrder: 1, valueCode: '', valueDesc: 'M', swatchColor: '', swatchImg: '', valSeq: 1 },
        { optId: 101, optName: 'Color', optOrder: 2, valueCode: '#000000', valueDesc: 'Black', swatchColor: '#000000', swatchImg: '', valSeq: 1 },
        { optId: 102, optName: 'Color', optOrder: 2, valueCode: '#FFFFFF', valueDesc: 'White', swatchColor: '#FFFFFF', swatchImg: '', valSeq: 2 },
      ],
      images: [
        { imageId: 1, skuId: 9001, imageUrl: 'https://cdn.example.com/black.jpg', imageType: 'large', imageDesc: '', sortOrder: 0, optionIds: [101] },
        { imageId: 2, skuId: 9002, imageUrl: 'https://cdn.example.com/white.jpg', imageType: 'large', imageDesc: '', sortOrder: 0, optionIds: [102] },
      ],
    });
    fixture.detectChanges();

    detail.selectOption('Color', 102);
    fixture.detectChanges();
    // Still showing the first image — no color-driven swap since Color
    // isn't axes()[0] here.
    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/black.jpg');

    const thumbs: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.product-detail__thumb');
    thumbs[0].click();
    fixture.detectChanges();
    // Clicking the Black photo doesn't re-pick Color back to Black either
    // — the selection made via `selectOption` above is left alone.
    expect(detail.selections()['Color']).toBe(102);
  });

  it('should highlight the thumbnail that was actually clicked, and swap the hero image to match', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      images: [
        { imageId: 1, skuId: 9001, imageUrl: 'https://cdn.example.com/hero.jpg', imageType: 'large', imageDesc: '', sortOrder: 0 },
        { imageId: 2, skuId: 9001, imageUrl: 'https://cdn.example.com/back.jpg', imageType: 'gallery', imageDesc: '', sortOrder: 1 },
      ],
    });
    fixture.detectChanges();

    const thumbs: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.product-detail__thumb');
    expect(thumbs.length).toBe(2);
    expect(thumbs[0].classList).toContain('product-detail__thumb--active');
    expect(thumbs[1].classList).not.toContain('product-detail__thumb--active');

    thumbs[1].click();
    fixture.detectChanges();

    expect(thumbs[0].classList).not.toContain('product-detail__thumb--active');
    expect(thumbs[1].classList).toContain('product-detail__thumb--active');
    expect(fixture.nativeElement.querySelector('.product-detail__hero img').src).toContain(
      'back.jpg',
    );
  });

  it("should swap the hero photo to the resolved sku's own variant image once it has one", () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      images: [
        { imageId: 1, skuId: 9001, imageUrl: 'https://cdn.example.com/hero.jpg', imageType: 'large', imageDesc: '', sortOrder: 0 },
      ],
    });
    fixture.detectChanges();
    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/hero.jpg');

    expectRequest(httpMock, '*AVAIL').flush({
      resolvedSkuId: 9002,
      axes: [
        { optName: 'Color', optOrder: 1, availableOptIds: [102] },
        { optName: 'Size', optOrder: 2, availableOptIds: [201] },
      ],
    });
    fixture.detectChanges();
    expectRequest(httpMock, '*GET_SKU').flush({ ...WHITE_M_SKU, variantImageUrl: 'https://cdn.example.com/white-m.jpg' });
    fixture.detectChanges();

    expect(detail.activeImageUrl()).toBe('https://cdn.example.com/white-m.jpg');
  });

  it('should show the thumbnails without carousel nav when they all fit on one row', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      images: [
        { imageId: 1, skuId: null, imageUrl: 'https://cdn.example.com/hero.jpg', imageType: 'gallery', imageDesc: '', sortOrder: 0 },
        { imageId: 2, skuId: null, imageUrl: 'https://cdn.example.com/side.jpg', imageType: 'gallery', imageDesc: '', sortOrder: 1 },
      ],
    });
    fixture.detectChanges();

    // jsdom reports 0 for both scrollWidth and clientWidth (no real
    // layout), i.e. "everything fits" — the same state a real, wide-enough
    // row would be in.
    expect(fixture.componentInstance.thumbsOverflow()).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('.product-detail__thumb').length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.thumb-nav').length).toBe(0);
  });

  it('should show carousel nav once the thumbnails no longer fit on one row', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush({
      ...RESPONSE,
      images: [
        { imageId: 1, skuId: null, imageUrl: 'https://cdn.example.com/hero.jpg', imageType: 'gallery', imageDesc: '', sortOrder: 0 },
        { imageId: 2, skuId: null, imageUrl: 'https://cdn.example.com/side.jpg', imageType: 'gallery', imageDesc: '', sortOrder: 1 },
      ],
    });
    fixture.detectChanges();

    const track: HTMLElement = fixture.nativeElement.querySelector('.thumb-track');
    Object.defineProperty(track, 'scrollWidth', { configurable: true, value: 400 });
    Object.defineProperty(track, 'clientWidth', { configurable: true, value: 200 });
    detail.updateThumbsOverflow();
    fixture.detectChanges();

    expect(detail.thumbsOverflow()).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.thumb-nav').length).toBe(2);
  });

  it('should not show the carousel at all for a single image', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.thumb-carousel')).toBeNull();
  });

  it('should unpick an axis when its already-selected value is clicked again', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    const detail = fixture.componentInstance;
    fixture.componentRef.setInput('productPk', '12345');
    fixture.detectChanges();
    expectRequest(httpMock, '*GET').flush(RESPONSE);
    fixture.detectChanges();

    detail.selectOption('Color', 101);
    detail.selectOption('Size', 201);
    fixture.detectChanges();
    expect(detail.selections()['Color']).toBe(101);

    detail.selectOption('Color', 101);
    fixture.detectChanges();

    expect(detail.selections()['Color']).toBeUndefined();
    expect(detail.selections()['Size']).toBe(201);
  });

  it('should surface the API message when the product cannot be loaded', () => {
    const fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('productPk', '999999');
    fixture.detectChanges();

    expectRequest(httpMock, '*GET').flush({ success: false, message: 'Product not found.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.alert').textContent).toContain('Product not found.');
  });
});
