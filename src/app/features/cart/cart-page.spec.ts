import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { Cart } from '../../core/cart/cart';
import { CartPage } from './cart-page';

const CART: Cart = {
  cartId: 501,
  itemCount: 3,
  subtotalPrice: 269.97,
  subtotalPoints: 450,
  items: [
    {
      cartItemId: 9001,
      skuId: 9001,
      quantity: 2,
      priceAtAdd: 89.99,
      pointsAtAdd: 150,
      lineTotalPrice: 179.98,
      lineTotalPoints: 300,
      productPk: 12345,
      productTitle: "Men's Trail Jacket",
      handle: 'mens-trail-jacket',
      skuCode: 'ABC-100-BLK-M',
      currentPrice: 89.99,
      currentPoints: 150,
      priceChanged: 'N',
      pointsChanged: 'N',
      isAvailable: 'Y',
      imageUrl: 'https://cdn.example.com/black-m.jpg',
      options: [
        { optName: 'Color', valueDesc: 'Black' },
        { optName: 'Size', valueDesc: 'M' },
      ],
    },
    {
      cartItemId: 9002,
      skuId: 9002,
      quantity: 1,
      priceAtAdd: 89.99,
      pointsAtAdd: 150,
      lineTotalPrice: 89.99,
      lineTotalPoints: 150,
      productPk: 12346,
      productTitle: 'Duty Belt',
      handle: 'duty-belt',
      skuCode: 'XYZ-200-BLK',
      currentPrice: 89.99,
      currentPoints: 150,
      priceChanged: 'N',
      pointsChanged: 'N',
      isAvailable: 'Y',
      imageUrl: '',
      options: [],
    },
  ],
};

function expectCartRequest(httpMock: HttpTestingController, action: string) {
  const matches = httpMock.match(
    (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART' && req.body?.action === action,
  );
  expect(matches.length).toBe(1);
  return matches[0];
}

// This page renders `<app-header/>`, which independently fires its own
// `*GET` on init too — both land on the exact same action, so they can't be
// told apart by action the way the page's other (page-only) actions can.
// Flush every pending `*GET` with the same response.
function flushInitialCartLoads(httpMock: HttpTestingController, response: object) {
  const matches = httpMock.match(
    (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART' && req.body?.action === '*GET',
  );
  expect(matches.length).toBeGreaterThan(0);
  matches.forEach((req) => req.flush(response as never));
}

describe('CartPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    // `<app-header/>`, rendered by this page too, restores a session from
    // localStorage, which (unlike TestBed's DI container) isn't reset
    // between spec files.
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [CartPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(CartPage);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should scroll to the top of the page on first render', () => {
    const fixture = TestBed.createComponent(CartPage);
    const scrollIntoViewSpy = vi.fn();
    fixture.nativeElement.scrollIntoView = scrollIntoViewSpy;

    fixture.detectChanges();

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('should load the cart on init and render its lines', () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();

    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Men's Trail Jacket");
    expect(fixture.nativeElement.textContent).toContain('Black, M');
    expect(fixture.nativeElement.textContent).toContain('Duty Belt');
    expect(fixture.nativeElement.querySelectorAll('.cart-page__row').length).toBe(2);
  });

  it('should show the empty state and no rows when the cart has nothing in it', () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();

    flushInitialCartLoads(httpMock, {
      cartId: null,
      itemCount: 0,
      subtotalPrice: 0,
      subtotalPoints: null,
      items: [],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Your cart is empty.');
    expect(fixture.nativeElement.querySelector('.cart-page__row')).toBeNull();
  });

  it('should surface the API message when the cart fails to load', () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();

    // Header's own incidental load fails right along with this page's —
    // it swallows that silently (see header.ts), so only this page needs
    // to be checked for surfacing it.
    flushInitialCartLoads(httpMock, { success: false, message: 'Not logged in.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.alert').textContent).toContain('Not logged in.');
  });

  it('should update a quantity via the stepper', () => {
    const fixture = TestBed.createComponent(CartPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    page.setQuantity(CART.items[0], 3);
    fixture.detectChanges();

    expect(page.updatingSkuId()).toBe(9001);
    const req = expectCartRequest(httpMock, '*UPDATE_QT');
    expect(req.request.body).toEqual({ action: '*UPDATE_QT', skuId: 9001, qty: 3 });
    req.flush({ ...CART, items: [{ ...CART.items[0], quantity: 3 }, CART.items[1]] });
    fixture.detectChanges();

    expect(page.updatingSkuId()).toBeNull();
  });

  it('should not send a request when the quantity is unchanged', () => {
    const fixture = TestBed.createComponent(CartPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    page.setQuantity(CART.items[0], 2);

    expect(httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART')).toHaveLength(0);
  });

  it('should remove a line', () => {
    const fixture = TestBed.createComponent(CartPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    page.removeItem(CART.items[1]);
    const req = expectCartRequest(httpMock, '*RMV_ITEM');
    expect(req.request.body).toEqual({ action: '*RMV_ITEM', skuId: 9002 });
    req.flush({ ...CART, items: [CART.items[0]] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.cart-page__row').length).toBe(1);
  });

  it('should clear the whole cart', () => {
    const fixture = TestBed.createComponent(CartPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    page.clearCart();
    expect(page.clearing()).toBe(true);
    const req = expectCartRequest(httpMock, '*CLEAR');
    expect(req.request.body).toEqual({ action: '*CLEAR' });
    req.flush({ cartId: 501, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] });
    fixture.detectChanges();

    expect(page.clearing()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Your cart is empty.');
  });

  it('should surface the API message when a quantity update fails', () => {
    const fixture = TestBed.createComponent(CartPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    page.setQuantity(CART.items[0], 5);
    expectCartRequest(httpMock, '*UPDATE_QT').flush({ success: false, message: 'Out of stock.' });
    fixture.detectChanges();

    expect(page.updatingSkuId()).toBeNull();
    expect(page.error()).toBe('Out of stock.');
    expect(fixture.nativeElement.textContent).toContain('Out of stock.');
  });
});
