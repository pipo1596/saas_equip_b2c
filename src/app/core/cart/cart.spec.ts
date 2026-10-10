import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Cart, CartService } from './cart';

const LOCATION_ID = 18;

const CART: Cart = {
  cartId: 501,
  itemCount: 3,
  subtotalPrice: 259.97,
  subtotalPoints: 450,
  allotment: null,
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

const ALLOTMENT_BAR = {
  ruleId: 11,
  label: 'Allotment',
  unit: 'DOLLARS' as const,
  total: 600,
  used: 180,
  inCart: 95,
  available: 325,
};

const DOLLAR_RULE = {
  ruleId: 11,
  ruleName: 'ANB Employee Allowance',
  allotType: 'DOLLAR' as const,
  primaryUnit: 'DOLLARS' as const,
  isBarRule: 'Y' as const,
  dollars: { total: 600, used: 180, inCart: 95, available: 325 },
  units: null,
  points: null,
  cycle: {
    renewalBasis: 'FIXED' as const,
    renewalPeriodMonths: 12,
    cycleStart: '2026-01-01',
    cycleEnd: '2026-12-31',
    renewsOn: '2027-01-01',
    expirationDate: null,
    onExpiration: 'SUSPEND' as const,
  },
  covers: { allAssortments: 'Y' as const, categories: [], unitGrants: [] },
  carryover: { type: 'PARTIAL' as const, pct: 25, capAmount: 150, carriedIn: 0 },
  quotas: [
    {
      quotaId: 4,
      programId: 3,
      programName: 'ANB Standard Program',
      progCatId: 45,
      categoryName: 'Shirts',
      limitType: 'UNITS' as const,
      limitValue: 6,
    },
  ],
  requireApproval: 'N' as const,
  allowCcFallback: 'Y' as const,
};

const POINTS_RULE = {
  ...DOLLAR_RULE,
  ruleId: 12,
  ruleName: 'Points Allowance',
  allotType: 'POINTS' as const,
  primaryUnit: 'POINTS' as const,
  dollars: null,
  points: { total: 1000, used: 300, inCart: 150, available: 550 },
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
      allotment: null,
    });
  });

  describe('load', () => {
    it('posts *GET with the locationId and updates the cart signal', () => {
      let result: Cart | undefined;
      service.load(LOCATION_ID).subscribe((cart) => (result = cart));

      expect(service.loading()).toBe(true);
      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({ action: '*GET', locationId: LOCATION_ID });
      req.flush(CART);

      expect(service.loading()).toBe(false);
      expect(result).toEqual(CART);
      expect(service.cart()).toEqual(CART);
    });

    it('sends a null locationId when none is known yet', () => {
      service.load(null).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({ action: '*GET', locationId: null });
      req.flush(CART);
    });

    it('includes productPk only when given (product detail page)', () => {
      service.load(LOCATION_ID, 12345).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({
        action: '*GET',
        locationId: LOCATION_ID,
        productPk: 12345,
      });
      req.flush(CART);
    });

    it('normalizes a null items list to []', () => {
      let result: Cart | undefined;
      service.load(LOCATION_ID).subscribe((cart) => (result = cart));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush({
        cartId: null,
        itemCount: 0,
        subtotalPrice: 0,
        subtotalPoints: null,
        items: null,
        allotment: null,
      });

      expect(result?.items).toEqual([]);
    });

    it('normalizes a missing options array on a line to []', () => {
      let result: Cart | undefined;
      service.load(LOCATION_ID).subscribe((cart) => (result = cart));

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush({
        ...CART,
        items: [{ ...CART.items[0], options: null }],
      });

      expect(result?.items[0].options).toEqual([]);
    });

    it('errors with the API message when the response carries no items key', () => {
      let error: unknown;
      service.load(LOCATION_ID).subscribe({ error: (err) => (error = err) });

      httpMock
        .expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART')
        .flush({ success: false, message: 'Not logged in.' });

      expect((error as Error).message).toBe('Not logged in.');
      expect(service.loading()).toBe(false);
    });

    it('falls back to a generic message when the API omits one', () => {
      let error: unknown;
      service.load(LOCATION_ID).subscribe({ error: (err) => (error = err) });

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush({ success: false, message: null });

      expect((error as Error).message).toBe('We could not load your cart.');
    });

    describe('allotment', () => {
      it('normalizes a null allotment to null', () => {
        let result: Cart | undefined;
        service.load(LOCATION_ID).subscribe((cart) => (result = cart));

        httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush({ ...CART, allotment: null });

        expect(result?.allotment).toBeNull();
      });

      it('passes through a full allotment block, normalizing missing inner arrays to []', () => {
        let result: Cart | undefined;
        service.load(LOCATION_ID).subscribe((cart) => (result = cart));

        httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush({
          ...CART,
          allotment: {
            programId: 3,
            allotmentBar: ALLOTMENT_BAR,
            ruleCount: 1,
            allotExclTaxFreight: 'N',
            rules: [
              {
                ...DOLLAR_RULE,
                covers: { allAssortments: 'N', categories: null, unitGrants: null },
                quotas: null,
              },
            ],
            approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
            openOrders: null,
            lineTags: null,
            productTag: null,
          },
        });

        expect(result?.allotment?.allotmentBar).toEqual(ALLOTMENT_BAR);
        expect(result?.allotment?.rules[0].covers).toEqual({
          allAssortments: 'N',
          categories: [],
          unitGrants: [],
        });
        expect(result?.allotment?.rules[0].quotas).toEqual([]);
        expect(result?.allotment?.lineTags).toEqual([]);
      });

      it('passes through lineTags and productTag as-is', () => {
        let result: Cart | undefined;
        service.load(LOCATION_ID, 123).subscribe((cart) => (result = cart));

        httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush({
          ...CART,
          allotment: {
            programId: 3,
            allotmentBar: ALLOTMENT_BAR,
            ruleCount: 1,
            allotExclTaxFreight: 'N',
            rules: [DOLLAR_RULE],
            approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
            openOrders: null,
            lineTags: [
              { cartItemId: 501, skuId: 9001, ruleId: 11, payUnit: 'DOLLARS', tagLabel: '$ allotment' },
            ],
            productTag: { productPk: 123, ruleId: 12, payUnit: 'UNITS', tagLabel: 'uses units' },
          },
        });

        expect(result?.allotment?.lineTags).toEqual([
          {
            cartItemId: 501,
            skuId: 9001,
            ruleId: 11,
            payUnit: 'DOLLARS',
            tagLabel: '$ allotment',
            allocations: [],
          },
        ]);
        expect(result?.allotment?.productTag).toEqual({
          productPk: 123,
          ruleId: 12,
          payUnit: 'UNITS',
          tagLabel: 'uses units',
        });
      });

      it('normalizes a missing fallbackRuleIds on a rule to []', () => {
        let result: Cart | undefined;
        service.load(LOCATION_ID).subscribe((cart) => (result = cart));

        httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush({
          ...CART,
          allotment: {
            programId: 3,
            allotmentBar: ALLOTMENT_BAR,
            ruleCount: 1,
            allotExclTaxFreight: 'N',
            rules: [DOLLAR_RULE],
            approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
            openOrders: null,
            lineTags: null,
            productTag: null,
          },
        });

        expect(result?.allotment?.rules[0].fallbackRuleIds).toEqual([]);
      });

      it('passes through a fallback chain and a split line allocation as-is', () => {
        let result: Cart | undefined;
        service.load(LOCATION_ID).subscribe((cart) => (result = cart));

        httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush({
          ...CART,
          allotment: {
            programId: 3,
            allotmentBar: ALLOTMENT_BAR,
            ruleCount: 2,
            allotExclTaxFreight: 'N',
            rules: [
              { ...DOLLAR_RULE, ruleId: 21, ruleName: 'Uniform allotment', fallbackRuleIds: [22] },
              { ...DOLLAR_RULE, ruleId: 22, ruleName: 'Footwear allotment', fallbackRuleIds: [] },
            ],
            approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
            openOrders: null,
            lineTags: [
              {
                cartItemId: 501,
                skuId: 9001,
                ruleId: 21,
                payUnit: 'DOLLARS',
                tagLabel: '$ allotment',
                allocations: [
                  { ruleId: 21, payUnit: 'DOLLARS', amount: 100 },
                  { ruleId: 22, payUnit: 'DOLLARS', amount: 40 },
                ],
              },
            ],
            productTag: null,
          },
        });

        expect(result?.allotment?.rules[0].fallbackRuleIds).toEqual([22]);
        expect(result?.allotment?.lineTags[0].allocations).toEqual([
          { ruleId: 21, payUnit: 'DOLLARS', amount: 100 },
          { ruleId: 22, payUnit: 'DOLLARS', amount: 40 },
        ]);
      });
    });
  });

  describe('addItem', () => {
    it('posts *ADD_ITEM with skuId, locationId and qty, defaulting qty to 1', () => {
      service.addItem(9001, LOCATION_ID).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({
        action: '*ADD_ITEM',
        skuId: 9001,
        locationId: LOCATION_ID,
        qty: 1,
      });
      req.flush(CART);
    });

    it('passes through an explicit qty', () => {
      service.addItem(9001, LOCATION_ID, 3).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({
        action: '*ADD_ITEM',
        skuId: 9001,
        locationId: LOCATION_ID,
        qty: 3,
      });
      req.flush(CART);
    });

    it('updates the shared cart signal on success', () => {
      service.addItem(9001, LOCATION_ID).subscribe();

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush(CART);

      expect(service.cart()).toEqual(CART);
    });
  });

  describe('removeItem', () => {
    it('omits qty entirely when not given, to remove the whole line', () => {
      service.removeItem(9001, LOCATION_ID).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({ action: '*RMV_ITEM', skuId: 9001, locationId: LOCATION_ID });
      req.flush({ ...CART, items: [] });
    });

    it('passes through an explicit qty to decrement by', () => {
      service.removeItem(9001, LOCATION_ID, 1).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({
        action: '*RMV_ITEM',
        skuId: 9001,
        locationId: LOCATION_ID,
        qty: 1,
      });
      req.flush(CART);
    });

    it('updates the shared cart signal on success', () => {
      const emptied: Cart = {
        cartId: 501,
        itemCount: 0,
        subtotalPrice: 0,
        subtotalPoints: null,
        items: [],
        allotment: null,
      };
      service.removeItem(9001, LOCATION_ID).subscribe();

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush(emptied);

      expect(service.cart()).toEqual(emptied);
    });
  });

  describe('setQuantity', () => {
    it('posts *UPDATE_QT with the exact new quantity and locationId', () => {
      service.setQuantity(9001, 5, LOCATION_ID).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({
        action: '*UPDATE_QT',
        skuId: 9001,
        qty: 5,
        locationId: LOCATION_ID,
      });
      req.flush(CART);
    });

    it('updates the shared cart signal on success', () => {
      service.setQuantity(9001, 5, LOCATION_ID).subscribe();

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush(CART);

      expect(service.cart()).toEqual(CART);
    });
  });

  describe('clear', () => {
    it('posts *CLEAR with the locationId and no skuId/qty', () => {
      service.clear(LOCATION_ID).subscribe();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART');
      expect(req.request.body).toEqual({ action: '*CLEAR', locationId: LOCATION_ID });
      req.flush({
        cartId: 501,
        itemCount: 0,
        subtotalPrice: 0,
        subtotalPoints: null,
        items: [],
        allotment: null,
      });
    });

    it('updates the shared cart signal on success', () => {
      const emptied: Cart = {
        cartId: 501,
        itemCount: 0,
        subtotalPrice: 0,
        subtotalPoints: null,
        items: [],
        allotment: null,
      };
      service.clear(LOCATION_ID).subscribe();

      httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCCART').flush(emptied);

      expect(service.cart()).toEqual(emptied);
    });
  });

  describe('pointsOnly', () => {
    function cartWithRules(rules: object[]): Cart {
      return {
        ...CART,
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: rules.length,
          allotExclTaxFreight: 'N',
          rules,
          approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [],
          productTag: null,
        },
      } as Cart;
    }

    it('is false when there is no allotment at all (falls back to showing dollars)', () => {
      service.cart.set(CART);
      expect(service.pointsOnly()).toBe(false);
    });

    it('is false whenever a dollar rule exists at all, even alongside a points rule', () => {
      service.cart.set(cartWithRules([DOLLAR_RULE]));
      expect(service.pointsOnly()).toBe(false);

      service.cart.set(cartWithRules([DOLLAR_RULE, POINTS_RULE]));
      expect(service.pointsOnly()).toBe(false);
    });

    it('is true once every allotment rule is points', () => {
      service.cart.set(cartWithRules([POINTS_RULE]));
      expect(service.pointsOnly()).toBe(true);

      service.cart.set(cartWithRules([POINTS_RULE, { ...POINTS_RULE, ruleId: 13 }]));
      expect(service.pointsOnly()).toBe(true);
    });

    it('is also true for a pure-units allotment, or a mix of points and units — dollars are what actually gates this, not points specifically', () => {
      const UNITS_RULE = {
        ...DOLLAR_RULE,
        ruleId: 14,
        ruleName: 'Knife Allowance',
        allotType: 'UNITS' as const,
        primaryUnit: 'UNITS' as const,
        dollars: null,
        units: { total: 1, used: 0, inCart: 0, available: 1 },
      };

      service.cart.set(cartWithRules([UNITS_RULE]));
      expect(service.pointsOnly()).toBe(true);

      service.cart.set(cartWithRules([UNITS_RULE, POINTS_RULE]));
      expect(service.pointsOnly()).toBe(true);
    });
  });
});
