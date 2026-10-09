import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { Cart } from '../../core/cart/cart';
import { POINTS_ONLY_ALLOTMENT } from '../../core/cart/cart.testing';
import { ConfirmService } from '../../shared/confirm/confirm';
import { CartPage } from './cart-page';

const CART: Cart = {
  cartId: 501,
  itemCount: 3,
  subtotalPrice: 269.97,
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

  it("should show points instead of dollars everywhere when the employee's allotment is points-only", () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();

    flushInitialCartLoads(httpMock, { ...CART, allotment: POINTS_ONLY_ALLOTMENT });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('$');

    const summary: HTMLElement = fixture.nativeElement.querySelector('.cart-page__summary');
    expect(summary.textContent).toContain('450 pts');

    const rows: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.cart-page__row'));
    expect(rows[0].querySelector('.cart-page__linetotal')?.textContent?.trim()).toBe('300 pts');
    expect(rows[0].querySelector('.cart-page__unit-price')?.textContent?.trim()).toBe('2 × 150 pts');
  });

  it("caps the 'Paid from' points amount at what the rule can really give, and shows the shortfall as a Balance line", () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();

    const OVERDRAWN_POINTS_ALLOTMENT = {
      ...POINTS_ONLY_ALLOTMENT,
      rules: [{ ...POINTS_ONLY_ALLOTMENT.rules[0], points: { total: 400, used: 0, inCart: 420, available: -20 } }],
    };
    flushInitialCartLoads(httpMock, { ...CART, allotment: OVERDRAWN_POINTS_ALLOTMENT });
    fixture.detectChanges();

    const summary: HTMLElement = fixture.nativeElement.querySelector('.cart-page__summary');
    expect(summary.textContent).toContain('400 pts');
    expect(summary.textContent).not.toContain('420 pts');
    expect(summary.textContent).toContain('Balance');
    expect(summary.textContent).toContain('20 pts');
  });

  it('shows no Balance line when the points allotment fully covers the order', () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();

    flushInitialCartLoads(httpMock, { ...CART, allotment: POINTS_ONLY_ALLOTMENT });
    fixture.detectChanges();

    const summary: HTMLElement = fixture.nativeElement.querySelector('.cart-page__summary');
    expect(summary.textContent).not.toContain('Balance');
  });

  it('should show the quantity × unit-price math for every line, regardless of quantity', () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    const rows: HTMLElement[] = fixture.nativeElement.querySelectorAll('.cart-page__row');
    expect(rows[0].querySelector('.cart-page__unit-price')?.textContent?.trim()).toBe('2 × $89.99');
    expect(rows[1].querySelector('.cart-page__unit-price')?.textContent?.trim()).toBe('1 × $89.99');
  });

  it("should link each line's thumbnail and name to a plain (non-edit) product view", () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelectorAll('.cart-page__row')[0];
    const expectedHref = '/product/12345';
    expect(row.querySelector('.cart-page__thumb-link')?.getAttribute('href')).toBe(expectedHref);
    expect(row.querySelector('.cart-page__name')?.getAttribute('href')).toBe(expectedHref);
  });

  it('should link the explicit Edit action to the product page in edit mode', () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    const row: HTMLElement = fixture.nativeElement.querySelectorAll('.cart-page__row')[0];
    const editLink = row.querySelector('.cart-page__edit');
    expect(editLink?.getAttribute('href')).toBe('/product/12345?cartItemId=9001');
    expect(editLink?.textContent?.trim()).toBe('Edit');
  });

  it("should show each line's pay-with tag, matched by cartItemId", () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();

    flushInitialCartLoads(httpMock, {
      ...CART,
      allotment: {
        programId: 3,
        allotmentBar: null,
        ruleCount: 1,
        allotExclTaxFreight: 'N',
        rules: [],
        approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
        openOrders: null,
        lineTags: [
          { cartItemId: 9001, skuId: 9001, ruleId: 11, payUnit: 'DOLLARS', tagLabel: '$ allotment' },
        ],
        productTag: null,
      },
    });
    fixture.detectChanges();

    const rows: HTMLElement[] = fixture.nativeElement.querySelectorAll('.cart-page__row');
    expect(rows[0].querySelector('.pay-tag')?.textContent?.trim()).toBe('$ allotment');
    // The second line has no matching tag — nothing covers it.
    expect(rows[1].querySelector('.pay-tag')).toBeNull();
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

  it('should link Checkout to the new checkout page', () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.cart-page__checkout')?.getAttribute('href')).toBe('/checkout');
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
    expect(req.request.body).toEqual({ action: '*UPDATE_QT', skuId: 9001, qty: 3, locationId: null });
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

  it('should remove a line once the confirmation is accepted', () => {
    const fixture = TestBed.createComponent(CartPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    const confirmService = TestBed.inject(ConfirmService);
    page.removeItem(CART.items[1]);
    expect(confirmService.request()).toEqual({
      title: 'Remove item',
      message: 'Remove Duty Belt from your cart?',
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      danger: true,
    });
    confirmService.respond(true);
    const req = expectCartRequest(httpMock, '*RMV_ITEM');
    expect(req.request.body).toEqual({ action: '*RMV_ITEM', skuId: 9002, locationId: null });
    req.flush({ ...CART, items: [CART.items[0]] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.cart-page__row').length).toBe(1);
  });

  it('should not remove a line when the confirmation is declined', () => {
    const fixture = TestBed.createComponent(CartPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    page.removeItem(CART.items[1]);
    TestBed.inject(ConfirmService).respond(false);

    httpMock.expectNone((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART' && req.body?.action === '*RMV_ITEM');
    expect(fixture.nativeElement.querySelectorAll('.cart-page__row').length).toBe(2);
  });

  it('should clear the whole cart once the confirmation is accepted', () => {
    const fixture = TestBed.createComponent(CartPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    const confirmService = TestBed.inject(ConfirmService);
    page.clearCart();
    expect(confirmService.request()).toEqual({
      title: 'Clear cart',
      message: 'Remove all items from your cart?',
      confirmLabel: 'Clear cart',
      cancelLabel: 'Cancel',
      danger: true,
    });
    confirmService.respond(true);
    expect(page.clearing()).toBe(true);
    const req = expectCartRequest(httpMock, '*CLEAR');
    expect(req.request.body).toEqual({ action: '*CLEAR', locationId: null });
    req.flush({ cartId: 501, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] });
    fixture.detectChanges();

    expect(page.clearing()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Your cart is empty.');
  });

  it('should not clear the cart when the confirmation is declined', () => {
    const fixture = TestBed.createComponent(CartPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    page.clearCart();
    TestBed.inject(ConfirmService).respond(false);

    expect(page.clearing()).toBe(false);
    httpMock.expectNone((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART' && req.body?.action === '*CLEAR');
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

  describe('allotment groups', () => {
    const UNIFORM_RULE = {
      ruleId: 21,
      ruleName: 'Uniform allotment',
      allotType: 'DOLLAR' as const,
      primaryUnit: 'DOLLARS' as const,
      isBarRule: 'Y' as const,
      dollars: { total: 100, used: 0, inCart: 100, available: 0 },
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
      covers: { allAssortments: 'N' as const, categories: [{ progCatId: 1, categoryName: 'Uniform' }], unitGrants: [] },
      carryover: { type: 'FORFEIT' as const, pct: null, capAmount: null, carriedIn: null },
      quotas: [],
      requireApproval: 'N' as const,
      allowCcFallback: 'N' as const,
      fallbackRuleIds: [22],
    };

    const FOOTWEAR_RULE = {
      ...UNIFORM_RULE,
      ruleId: 22,
      ruleName: 'Footwear allotment',
      dollars: { total: 200, used: 0, inCart: 160, available: 40 },
      covers: { allAssortments: 'N' as const, categories: [{ progCatId: 2, categoryName: 'Footwear' }], unitGrants: [] },
      fallbackRuleIds: [],
    };

    const UNIT_RULE = {
      ...UNIFORM_RULE,
      ruleId: 31,
      ruleName: 'Unit Allotment',
      primaryUnit: 'UNITS' as const,
      dollars: null,
      units: { total: 5, used: 2, inCart: 2, available: 1 },
      cycle: { ...UNIFORM_RULE.cycle, renewsOn: '2027-09-09' },
      covers: {
        allAssortments: 'N' as const,
        categories: [],
        unitGrants: [{ progCatId: 3, categoryName: 'Tactical', unitQty: 5 }],
      },
      fallbackRuleIds: [],
    };

    const SHIRT = {
      cartItemId: 1,
      skuId: 101,
      quantity: 2,
      priceAtAdd: 70,
      pointsAtAdd: null,
      lineTotalPrice: 140,
      lineTotalPoints: null,
      productPk: 201,
      productTitle: 'Station Shirt',
      handle: 'station-shirt',
      skuCode: 'SHIRT-1',
      currentPrice: 70,
      currentPoints: null,
      priceChanged: 'N',
      pointsChanged: 'N',
      isAvailable: 'Y',
      imageUrl: '',
      options: [],
    };

    const BOOT = {
      ...SHIRT,
      cartItemId: 2,
      skuId: 102,
      quantity: 1,
      lineTotalPrice: 120,
      productPk: 202,
      productTitle: 'Station Boot',
      skuCode: 'BOOT-1',
    };

    const PANTS = {
      ...SHIRT,
      cartItemId: 3,
      skuId: 103,
      quantity: 2,
      lineTotalPrice: 259.98,
      productPk: 203,
      productTitle: 'Tactical Pants',
      skuCode: 'PANTS-1',
    };

    const GROUPED_CART = {
      cartId: 501,
      itemCount: 5,
      subtotalPrice: 519.98,
      subtotalPoints: null,
      items: [SHIRT, BOOT, PANTS],
      allotment: {
        programId: 3,
        allotmentBar: null,
        ruleCount: 3,
        allotExclTaxFreight: 'N',
        rules: [UNIFORM_RULE, FOOTWEAR_RULE, UNIT_RULE],
        approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
        openOrders: null,
        lineTags: [
          {
            cartItemId: 1,
            skuId: 101,
            ruleId: 21,
            payUnit: 'DOLLARS',
            tagLabel: '$ allotment',
            allocations: [
              { ruleId: 21, payUnit: 'DOLLARS', amount: 100 },
              { ruleId: 22, payUnit: 'DOLLARS', amount: 40 },
            ],
          },
          {
            cartItemId: 2,
            skuId: 102,
            ruleId: 22,
            payUnit: 'DOLLARS',
            tagLabel: '$ allotment',
            allocations: [{ ruleId: 22, payUnit: 'DOLLARS', amount: 120 }],
          },
          {
            cartItemId: 3,
            skuId: 103,
            ruleId: 31,
            payUnit: 'UNITS',
            tagLabel: 'uses units',
            allocations: [{ ruleId: 31, payUnit: 'UNITS', amount: 2 }],
          },
        ],
        productTag: null,
      },
    };

    it('groups each line under its own (home) allotment, in the API-supplied rule order', () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, GROUPED_CART);
      fixture.detectChanges();

      const groups: HTMLElement[] = fixture.nativeElement.querySelectorAll('.allotment-group');
      expect(groups.length).toBe(3);
      expect(groups[0].querySelector('.allotment-group__name')?.textContent?.trim()).toBe('Uniform allotment');
      expect(groups[0].querySelectorAll('.cart-page__row').length).toBe(1);
      expect(groups[0].textContent).toContain('Station Shirt');

      expect(groups[1].querySelector('.allotment-group__name')?.textContent?.trim()).toBe('Footwear allotment');
      expect(groups[1].textContent).toContain('Station Boot');
      expect(groups[1].textContent).not.toContain('Station Shirt');

      expect(groups[2].querySelector('.allotment-group__name')?.textContent?.trim()).toBe('Unit Allotment');
      expect(groups[2].textContent).toContain('Tactical Pants');
    });

    it("shows a split line's per-allotment breakdown and a fallback note explaining it", () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, GROUPED_CART);
      fixture.detectChanges();

      const shirtRow: HTMLElement = fixture.nativeElement.querySelectorAll('.allotment-group')[0].querySelector('.cart-page__row')!;
      const splits: NodeListOf<HTMLElement> = shirtRow.querySelectorAll('.cart-page__split');
      expect(Array.from(splits).map((el) => el.textContent?.trim())).toEqual([
        '$100.00 Uniform',
        '$40.00 Footwear',
      ]);
      expect(shirtRow.querySelector('.cart-page__split--fallback')?.textContent?.trim()).toBe('$40.00 Footwear');
      expect(shirtRow.querySelector('.cart-page__fallback-note')?.textContent?.trim()).toBe(
        '$40.00 of these items is covered by your Footwear allotment, after your Uniform allotment ran out.',
      );
    });

    it("shows a plain line total with no split for an item that isn't shared across allotments", () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, GROUPED_CART);
      fixture.detectChanges();

      const bootRow: HTMLElement = fixture.nativeElement.querySelectorAll('.allotment-group')[1].querySelector('.cart-page__row')!;
      expect(bootRow.querySelector('.cart-page__linetotal')?.textContent?.trim()).toBe('$120.00');
      expect(bootRow.querySelectorAll('.cart-page__split').length).toBe(0);
      expect(bootRow.querySelector('.cart-page__fallback-note')).toBeNull();
    });

    it('shows a units-covered line as a quantity, with its dollar value noted separately', () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, GROUPED_CART);
      fixture.detectChanges();

      const pantsRow: HTMLElement = fixture.nativeElement.querySelectorAll('.allotment-group')[2].querySelector('.cart-page__row')!;
      expect(pantsRow.querySelector('.cart-page__linetotal')?.textContent?.trim()).toBe('2 units');
      expect(pantsRow.querySelector('.cart-page__value-note')?.textContent?.trim()).toBe('$259.98 value');
    });

    it("notes in the lending group's own header how much of its balance covered another group's overflow", () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, GROUPED_CART);
      fixture.detectChanges();

      const footwearGroup: HTMLElement = fixture.nativeElement.querySelectorAll('.allotment-group')[1];
      expect(footwearGroup.querySelector('.allotment-group__lent-note')?.textContent?.trim()).toBe(
        'In cart includes $40.00 for Uniform',
      );
      const uniformGroup: HTMLElement = fixture.nativeElement.querySelectorAll('.allotment-group')[0];
      expect(uniformGroup.querySelector('.allotment-group__lent-note')).toBeNull();
    });

    it('lists what pays for the order and what remains due at checkout', () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, GROUPED_CART);
      fixture.detectChanges();

      const summary: HTMLElement = fixture.nativeElement.querySelector('.cart-page__summary');
      expect(summary.textContent).toContain('Order value (5 items)');
      expect(summary.textContent).toContain('$519.98');
      expect(summary.textContent).toContain('Unit Allotment');
      expect(summary.textContent).toContain('2 units');
      expect(summary.textContent).toContain('Uniform allotment');
      expect(summary.textContent).toContain('$100.00');
      expect(summary.textContent).toContain('Footwear allotment');
      expect(summary.textContent).toContain('$160.00');
      expect(summary.textContent).toContain('Balance');
      expect(summary.textContent).toContain('$0.00');
    });

    it("groups and nets correctly from just the simple ruleId/payUnit tag, before the API sends a line's full allocations breakdown", () => {
      // Regression case: today's real API only tags a line with a single
      // ruleId/payUnit (no `allocations` array at all yet) — this must
      // still group correctly and net the checkout total to zero, not
      // silently fall back to the flat, ungrouped list.
      const GENERAL_RULE = {
        ...UNIFORM_RULE,
        ruleId: 41,
        ruleName: 'General Allotment',
        dollars: { total: 1200, used: 0, inCart: 1071.9, available: 128.1 },
        fallbackRuleIds: [],
      };
      const SIMPLE_UNIT_RULE = { ...UNIT_RULE, ruleId: 42, units: { total: 20, used: 0, inCart: 17, available: 3 } };

      const shirt = { ...SHIRT, cartItemId: 11, skuId: 111, quantity: 10, lineTotalPrice: 1289.1, productTitle: 'Shirt' };
      const cap = { ...SHIRT, cartItemId: 12, skuId: 112, quantity: 7, lineTotalPrice: 175, productTitle: 'Cap' };
      const boot = { ...SHIRT, cartItemId: 13, skuId: 113, quantity: 6, lineTotalPrice: 1071.9, productTitle: 'Blundstone Boot' };

      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, {
        cartId: 900,
        itemCount: 23,
        subtotalPrice: 2536.0,
        subtotalPoints: null,
        items: [shirt, cap, boot],
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 2,
          allotExclTaxFreight: 'N',
          rules: [GENERAL_RULE, SIMPLE_UNIT_RULE],
          approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            { cartItemId: 11, skuId: 111, ruleId: 42, payUnit: 'UNITS', tagLabel: 'uses units' },
            { cartItemId: 12, skuId: 112, ruleId: 42, payUnit: 'UNITS', tagLabel: 'uses units' },
            { cartItemId: 13, skuId: 113, ruleId: 41, payUnit: 'DOLLARS', tagLabel: '$ allotment' },
          ],
          productTag: null,
        },
      });
      fixture.detectChanges();

      const groups: HTMLElement[] = fixture.nativeElement.querySelectorAll('.allotment-group');
      expect(groups.length).toBe(2);
      expect(groups[0].textContent).toContain('Blundstone Boot');
      expect(groups[1].textContent).toContain('Shirt');
      expect(groups[1].textContent).toContain('Cap');
      expect(fixture.nativeElement.querySelector('.cart-page__items')).toBeNull();

      const summary: HTMLElement = fixture.nativeElement.querySelector('.cart-page__summary');
      expect(summary.textContent).toContain('Balance');
      expect(summary.textContent).toContain('$0.00');
    });

    it("still shows a balance due when a rule's own balance is over-drawn, instead of trusting each line's tag blindly", () => {
      // Both rules here are over-drawn (negative `available`) — a dollar
      // rule's shortfall is exact; a units rule's shortfall is prorated
      // across its own lines by their share of the requested units.
      const OVERDRAWN_GENERAL_RULE = {
        ...UNIFORM_RULE,
        ruleId: 51,
        ruleName: 'General Allotment',
        dollars: { total: 500, used: -42, inCart: 1071.9, available: -529.9 },
        fallbackRuleIds: [],
      };
      const OVERDRAWN_UNIT_RULE = {
        ...UNIT_RULE,
        ruleId: 52,
        units: { total: 11, used: 7, inCart: 26, available: -22 },
      };

      const boot = { ...SHIRT, cartItemId: 21, skuId: 211, quantity: 6, lineTotalPrice: 1071.9, productTitle: 'Boot' };
      const shirt = { ...SHIRT, cartItemId: 22, skuId: 212, quantity: 19, lineTotalPrice: 2449.29, productTitle: 'Shirt' };
      const cap = { ...SHIRT, cartItemId: 23, skuId: 213, quantity: 7, lineTotalPrice: 175, productTitle: 'Cap' };

      const fixture = TestBed.createComponent(CartPage);
      const page = fixture.componentInstance;
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, {
        cartId: 900,
        itemCount: 32,
        subtotalPrice: 3696.19,
        subtotalPoints: null,
        items: [boot, shirt, cap],
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 2,
          allotExclTaxFreight: 'N',
          rules: [OVERDRAWN_GENERAL_RULE, OVERDRAWN_UNIT_RULE],
          approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            { cartItemId: 21, skuId: 211, ruleId: 51, payUnit: 'DOLLARS', tagLabel: '$ allotment' },
            { cartItemId: 22, skuId: 212, ruleId: 52, payUnit: 'UNITS', tagLabel: 'uses units' },
            { cartItemId: 23, skuId: 213, ruleId: 52, payUnit: 'UNITS', tagLabel: 'uses units' },
          ],
          productTag: null,
        },
      });
      fixture.detectChanges();

      // $529.90 (the dollar rule's exact shortfall) + a prorated share of
      // the unit rule's 22-unit shortfall across its 26 requested units.
      expect(page.amountDueAtCheckout()).toBeCloseTo(529.9 + 2624.29 * (22 / 26), 2);

      const summary: HTMLElement = fixture.nativeElement.querySelector('.cart-page__summary');
      expect(summary.textContent).toContain('Balance');
      expect(summary.textContent).not.toContain('$0.00');
    });

    it('puts a line with no allotment coverage in a plain, ungrouped section', () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      const uncoveredItem = { ...SHIRT, cartItemId: 4, skuId: 104, productTitle: 'Plain Tee', skuCode: 'TEE-1' };
      flushInitialCartLoads(httpMock, {
        ...GROUPED_CART,
        items: [...GROUPED_CART.items, uncoveredItem],
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll('.allotment-group').length).toBe(3);
      const plainSection: HTMLElement = fixture.nativeElement.querySelector('.cart-page__items');
      expect(plainSection).not.toBeNull();
      expect(plainSection.textContent).toContain('Plain Tee');
      expect(plainSection.textContent).not.toContain('Station Shirt');
    });
  });
});
