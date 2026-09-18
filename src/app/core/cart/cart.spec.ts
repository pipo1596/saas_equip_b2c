import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Cart, CartService } from './cart';

const CART: Cart = {
  cartId: 501,
  itemCount: 3,
  subtotalPrice: 259.97,
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
  ],
};

describe('CartService', () => {
  let service: CartService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CartService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('drawerOpen', () => {
    it('starts closed and toggles via openDrawer/closeDrawer', () => {
      expect(service.drawerOpen()).toBe(false);

      service.openDrawer();
      expect(service.drawerOpen()).toBe(true);

      service.closeDrawer();
      expect(service.drawerOpen()).toBe(false);
    });
  });

  it('starts with an empty cart, not null', () => {
    expect(service.cart()).toEqual({
      cartId: null,
      itemCount: 0,
      subtotalPrice: 0,
      subtotalPoints: null,
      items: [],
    });
  });

  describe('load', () => {
    it('posts *GET and updates the cart signal', () => {
      let result: Cart | undefined;
      service.load().subscribe((cart) => (result = cart));

      expect(service.loading()).toBe(true);
      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({ action: '*GET' });
      req.flush(CART);

      expect(service.loading()).toBe(false);
      expect(result).toEqual(CART);
      expect(service.cart()).toEqual(CART);
    });

    it('normalizes a null items list to []', () => {
      let result: Cart | undefined;
      service.load().subscribe((cart) => (result = cart));

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART')
        .flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: null });

      expect(result?.items).toEqual([]);
    });

    it('normalizes a missing options array on a line to []', () => {
      let result: Cart | undefined;
      service.load().subscribe((cart) => (result = cart));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush({
        ...CART,
        items: [{ ...CART.items[0], options: null }],
      });

      expect(result?.items[0].options).toEqual([]);
    });

    it('errors with the API message when the response carries no items key', () => {
      let error: unknown;
      service.load().subscribe({ error: (err) => (error = err) });

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART')
        .flush({ success: false, message: 'Not logged in.' });

      expect((error as Error).message).toBe('Not logged in.');
      expect(service.loading()).toBe(false);
    });

    it('falls back to a generic message when the API omits one', () => {
      let error: unknown;
      service.load().subscribe({ error: (err) => (error = err) });

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush({ success: false, message: null });

      expect((error as Error).message).toBe('We could not load your cart.');
    });
  });

  describe('addItem', () => {
    it('posts *ADD_ITEM with skuId and qty, defaulting qty to 1', () => {
      service.addItem(9001).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({ action: '*ADD_ITEM', skuId: 9001, qty: 1 });
      req.flush(CART);
    });

    it('passes through an explicit qty', () => {
      service.addItem(9001, 3).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({ action: '*ADD_ITEM', skuId: 9001, qty: 3 });
      req.flush(CART);
    });

    it('updates the shared cart signal on success', () => {
      service.addItem(9001).subscribe();

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush(CART);

      expect(service.cart()).toEqual(CART);
    });
  });

  describe('removeItem', () => {
    it('omits qty entirely when not given, to remove the whole line', () => {
      service.removeItem(9001).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({ action: '*RMV_ITEM', skuId: 9001 });
      req.flush({ ...CART, items: [] });
    });

    it('passes through an explicit qty to decrement by', () => {
      service.removeItem(9001, 1).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({ action: '*RMV_ITEM', skuId: 9001, qty: 1 });
      req.flush(CART);
    });

    it('updates the shared cart signal on success', () => {
      const emptied: Cart = { cartId: 501, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] };
      service.removeItem(9001).subscribe();

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush(emptied);

      expect(service.cart()).toEqual(emptied);
    });
  });

  describe('setQuantity', () => {
    it('posts *UPDATE_QT with the exact new quantity', () => {
      service.setQuantity(9001, 5).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({ action: '*UPDATE_QT', skuId: 9001, qty: 5 });
      req.flush(CART);
    });

    it('updates the shared cart signal on success', () => {
      service.setQuantity(9001, 5).subscribe();

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush(CART);

      expect(service.cart()).toEqual(CART);
    });
  });

  describe('clear', () => {
    it('posts *CLEAR with no skuId or qty', () => {
      service.clear().subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({ action: '*CLEAR' });
      req.flush({ cartId: 501, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] });
    });

    it('updates the shared cart signal on success', () => {
      const emptied: Cart = { cartId: 501, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] };
      service.clear().subscribe();

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush(emptied);

      expect(service.cart()).toEqual(emptied);
    });
  });
});
