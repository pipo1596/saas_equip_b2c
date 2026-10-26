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
  roleRequiresApproval: 'N',
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
      progCatIds: [],
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
      progCatIds: [],
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

  it('shows a skeleton placeholder while the cart is still loading, then the real content once it resolves', () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelector('.cart-page__name')).toBeNull();

    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.skeleton').length).toBe(0);
    expect(fixture.nativeElement.querySelector('.cart-page__name')).not.toBeNull();
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
      lineTags: [
        { cartItemId: 9001, skuId: 9001, ruleId: 90, payUnit: 'POINTS' as const, tagLabel: 'Points Allowance', allocations: [] },
        { cartItemId: 9002, skuId: 9002, ruleId: 90, payUnit: 'POINTS' as const, tagLabel: 'Points Allowance', allocations: [] },
      ],
    };
    flushInitialCartLoads(httpMock, { ...CART, allotment: OVERDRAWN_POINTS_ALLOTMENT });
    fixture.detectChanges();

    const summary: HTMLElement = fixture.nativeElement.querySelector('.cart-page__summary');
    expect(summary.textContent).toContain('400 pts');
    expect(summary.textContent).not.toContain('420 pts');
    expect(summary.textContent).toContain('Balance');
    expect(summary.textContent).toContain('20 pts');
  });

  it("breaks a multi-assortment unit allotment's 'Paid from' line down by category", () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();

    const UNITS_RULE = {
      ruleId: 12,
      ruleName: 'Unit Allotment',
      allotType: 'UNITS' as const,
      primaryUnit: 'UNITS' as const,
      isBarRule: 'N' as const,
      dollars: null,
      units: { total: 5, used: 0, inCart: 3, available: 2 },
      points: null,
      cycle: {
        renewalBasis: 'FIXED' as const,
        renewalPeriodMonths: 12,
        cycleStart: '2026-09-09',
        cycleEnd: '2027-09-08',
        renewsOn: '2027-09-09',
        expirationDate: null,
        onExpiration: 'SUSPEND' as const,
      },
      covers: {
        allAssortments: 'N' as const,
        categories: [],
        unitGrants: [
          { progCatId: 52, categoryName: 'Jacket', unitQty: 3 },
          { progCatId: 53, categoryName: 'Duty Belt', unitQty: 2 },
        ],
      },
      carryover: { type: 'FORFEIT' as const, pct: null, capAmount: null, carriedIn: null },
      quotas: [],
      fallbacks: [],
    };
    flushInitialCartLoads(httpMock, {
      ...CART,
      items: [
        { ...CART.items[0], progCatIds: [52] },
        { ...CART.items[1], progCatIds: [53] },
      ],
      allotment: {
        programId: 3,
        allotmentBar: null,
        ruleCount: 1,
        allotExclTaxFreight: 'N',
        rules: [UNITS_RULE],
        approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
        openOrders: null,
        lineTags: [
          { cartItemId: 9001, skuId: 9001, ruleId: 12, payUnit: 'UNITS' as const, tagLabel: 'Unit Allotment', allocations: [] },
          { cartItemId: 9002, skuId: 9002, ruleId: 12, payUnit: 'UNITS' as const, tagLabel: 'Unit Allotment', allocations: [] },
        ],
        productTag: null,
      },
    });
    fixture.detectChanges();

    const summary: HTMLElement = fixture.nativeElement.querySelector('.cart-page__summary');
    expect(summary.textContent).toContain('Unit Allotment');
    const breakdown: HTMLElement[] = Array.from(summary.querySelectorAll('.cart-page__category-breakdown li'));
    expect(breakdown.map((li) => li.textContent?.trim().replace(/\s+/g, ' '))).toEqual([
      'Jacket2 units',
      'Duty Belt1 units',
    ]);
  });

  it('shows no Balance line when every line is tagged and the points allotment fully covers the order', () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();

    const FULLY_TAGGED_ALLOTMENT = {
      ...POINTS_ONLY_ALLOTMENT,
      lineTags: [
        { cartItemId: 9001, skuId: 9001, ruleId: 90, payUnit: 'POINTS' as const, tagLabel: 'Points Allowance', allocations: [] },
        { cartItemId: 9002, skuId: 9002, ruleId: 90, payUnit: 'POINTS' as const, tagLabel: 'Points Allowance', allocations: [] },
      ],
    };
    flushInitialCartLoads(httpMock, { ...CART, allotment: FULLY_TAGGED_ALLOTMENT });
    fixture.detectChanges();

    const summary: HTMLElement = fixture.nativeElement.querySelector('.cart-page__summary');
    expect(summary.textContent).not.toContain('Balance');
  });

  it('shows the Balance line when a line has no points coverage at all, even though no rule is over-drawn', () => {
    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();

    // Only the first line (300 pts) is tagged — the second (150 pts) isn't
    // covered by anything, the same way an item with no allotment at all
    // would fall to a credit-card balance in dollar mode.
    const PARTIALLY_TAGGED_ALLOTMENT = {
      ...POINTS_ONLY_ALLOTMENT,
      lineTags: [
        { cartItemId: 9001, skuId: 9001, ruleId: 90, payUnit: 'POINTS' as const, tagLabel: 'Points Allowance', allocations: [] },
      ],
    };
    flushInitialCartLoads(httpMock, { ...CART, allotment: PARTIALLY_TAGGED_ALLOTMENT });
    fixture.detectChanges();

    const summary: HTMLElement = fixture.nativeElement.querySelector('.cart-page__summary');
    expect(summary.textContent).toContain('Balance');
    expect(summary.textContent).toContain('150 pts');
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

  it('should not let the stepper take a line down to 0 — Remove is the only way to delete a line', () => {
    const fixture = TestBed.createComponent(CartPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    // `CART.items[1]` already has a quantity of 1.
    flushInitialCartLoads(httpMock, CART);
    fixture.detectChanges();

    page.setQuantity(CART.items[1], 0);

    expect(httpMock.match((req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART')).toHaveLength(0);

    const rows: HTMLElement[] = fixture.nativeElement.querySelectorAll('.cart-page__row');
    const decrementBtn: HTMLButtonElement = rows[1].querySelector('.qty-stepper__btn[aria-label="Decrease quantity"]')!;
    expect(decrementBtn.disabled).toBe(true);
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

  describe('unit allotment exceeded warning', () => {
    const UNITS_RULE = {
      ruleId: 31,
      ruleName: 'Unit Allotment',
      allotType: 'UNITS' as const,
      primaryUnit: 'UNITS' as const,
      isBarRule: 'N' as const,
      dollars: null,
      points: null,
      cycle: {
        renewalBasis: 'FIXED' as const,
        renewalPeriodMonths: 12,
        cycleStart: '2026-09-09',
        cycleEnd: '2027-09-08',
        renewsOn: '2027-09-09',
        expirationDate: null,
        onExpiration: 'SUSPEND' as const,
      },
      covers: { allAssortments: 'N' as const, categories: [], unitGrants: [{ progCatId: 3, categoryName: 'Tactical', unitQty: 5 }] },
      carryover: { type: 'FORFEIT' as const, pct: null, capAmount: null, carriedIn: null },
      quotas: [],
      fallbacks: [],
    };

    function cartWithUnitsLine(units: { total: number; used: number; inCart: number; available: number }) {
      return {
        ...CART,
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 1,
          allotExclTaxFreight: 'N' as const,
          rules: [{ ...UNITS_RULE, units }],
          approvals: { canApprove: 'N' as const, pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            {
              cartItemId: 9001,
              skuId: 9001,
              ruleId: 31,
              payUnit: 'UNITS' as const,
              tagLabel: 'Unit Allotment',
              allocations: [],
            },
          ],
        },
      };
    }

    it('allows raising the quantity past what is available — no stepper cap anymore', () => {
      const fixture = TestBed.createComponent(CartPage);
      const page = fixture.componentInstance;
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, cartWithUnitsLine({ total: 10, used: 4, inCart: 2, available: 2 }));
      fixture.detectChanges();

      page.setQuantity(CART.items[0], 9);

      const req = expectCartRequest(httpMock, '*UPDATE_QT');
      expect(req.request.body).toEqual({ action: '*UPDATE_QT', skuId: 9001, qty: 9, locationId: null });
    });

    it('shows no warning and allows Checkout while the rule is not over-drawn', () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, cartWithUnitsLine({ total: 10, used: 4, inCart: 2, available: 2 }));
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('is exceeded');
      expect(fixture.nativeElement.querySelector('a.cart-page__checkout')).not.toBeNull();
    });

    it("shows the exceeded-rule message and disables Checkout once the cart's own contents drive the rule negative", () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      // Mirrors the real bug report: total 11, used 4, this one line sitting
      // at 8 units already (over the 7 truly available) swings `available`
      // to -1.
      const EIGHT_CAPS = { ...CART.items[0], quantity: 8 };
      flushInitialCartLoads(httpMock, {
        ...cartWithUnitsLine({ total: 11, used: 4, inCart: 8, available: -1 }),
        items: [EIGHT_CAPS, CART.items[1]],
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        'Your Unit Allotment is exceeded. Please adjust qty before checking out.',
      );
      expect(fixture.nativeElement.querySelector('a.cart-page__checkout')).toBeNull();
      const checkoutBtn: HTMLButtonElement = fixture.nativeElement.querySelector('button.cart-page__checkout');
      expect(checkoutBtn.disabled).toBe(true);
    });

    it('shows no warning for a rule over-drawn by real usage alone, with nothing of this cart against it', () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, cartWithUnitsLine({ total: 10, used: 12, inCart: 0, available: -2 }));
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('is exceeded');
      expect(fixture.nativeElement.querySelector('a.cart-page__checkout')).not.toBeNull();
    });

    it("flags a specific assortment the cart has over-drawn and disables Checkout, even though the rule's pooled total still looks fine", () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      const MULTI_GRANT_RULE = {
        ...UNITS_RULE,
        // Plenty of room overall (7 of 11) — Tactical's own surplus masks
        // the Cap-specific overdraft in this pooled figure.
        units: { total: 11, used: 4, inCart: 13, available: 7 },
        covers: {
          allAssortments: 'N' as const,
          categories: [],
          unitGrants: [
            { progCatId: 52, categoryName: 'Cap', unitQty: 2, remaining: 2, reserved: 0 },
            { progCatId: 3, categoryName: 'Tactical', unitQty: 9, remaining: 9, reserved: 0 },
          ],
        },
      };
      flushInitialCartLoads(httpMock, {
        ...CART,
        items: [{ ...CART.items[0], quantity: 13, progCatIds: [52] }, CART.items[1]],
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 1,
          allotExclTaxFreight: 'N',
          rules: [MULTI_GRANT_RULE],
          approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            { cartItemId: 9001, skuId: 9001, ruleId: 31, payUnit: 'UNITS' as const, tagLabel: 'Unit Allotment', allocations: [] },
          ],
        },
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        'Your Unit Allotment for Cap is exceeded. Please adjust qty before checking out.',
      );
      expect(fixture.nativeElement.querySelector('a.cart-page__checkout')).toBeNull();
      const checkoutBtn: HTMLButtonElement = fixture.nativeElement.querySelector('button.cart-page__checkout');
      expect(checkoutBtn.disabled).toBe(true);
    });
  });

  describe('per-item unit category', () => {
    const MULTI_GRANT_RULE = {
      ruleId: 31,
      ruleName: 'Unit Allotment',
      allotType: 'UNITS' as const,
      primaryUnit: 'UNITS' as const,
      isBarRule: 'N' as const,
      dollars: null,
      points: null,
      cycle: {
        renewalBasis: 'FIXED' as const,
        renewalPeriodMonths: 12,
        cycleStart: '2026-09-09',
        cycleEnd: '2027-09-08',
        renewsOn: '2027-09-09',
        expirationDate: null,
        onExpiration: 'SUSPEND' as const,
      },
      covers: {
        allAssortments: 'N' as const,
        categories: [],
        unitGrants: [
          { progCatId: 52, categoryName: 'Cap', unitQty: 2, remaining: 2, reserved: 0 },
          { progCatId: 3, categoryName: 'Tactical', unitQty: 9, remaining: 9, reserved: 0 },
        ],
      },
      carryover: { type: 'FORFEIT' as const, pct: null, capAmount: null, carriedIn: null },
      quotas: [],
      fallbacks: [],
    };

    it("shows the matching assortment next to the pay-tag badge for a multi-category units rule", () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, {
        ...CART,
        items: [{ ...CART.items[0], quantity: 1, progCatIds: [52] }, CART.items[1]],
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 1,
          allotExclTaxFreight: 'N',
          rules: [{ ...MULTI_GRANT_RULE, units: { total: 11, used: 4, inCart: 1, available: 6 } }],
          approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            { cartItemId: 9001, skuId: 9001, ruleId: 31, payUnit: 'UNITS' as const, tagLabel: 'uses units', allocations: [] },
          ],
        },
      });
      fixture.detectChanges();

      const row: HTMLElement = fixture.nativeElement.querySelectorAll('.cart-page__row')[0];
      expect(row.querySelector('.pay-tag')?.textContent?.trim().replace(/\s+/g, ' ')).toBe('uses units · Cap');
    });

    it('omits the category for a rule with only one assortment', () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, {
        ...CART,
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 1,
          allotExclTaxFreight: 'N',
          rules: [
            {
              ...MULTI_GRANT_RULE,
              units: { total: 5, used: 0, inCart: 2, available: 3 },
              covers: {
                allAssortments: 'N',
                categories: [],
                unitGrants: [{ progCatId: 52, categoryName: 'Cap', unitQty: 5 }],
              },
            },
          ],
          approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            { cartItemId: 9001, skuId: 9001, ruleId: 31, payUnit: 'UNITS' as const, tagLabel: 'uses units', allocations: [] },
          ],
        },
      });
      fixture.detectChanges();

      const row: HTMLElement = fixture.nativeElement.querySelectorAll('.cart-page__row')[0];
      expect(row.querySelector('.pay-tag')?.textContent?.trim()).toBe('uses units');
    });

    it("moves an over-drawn line under a dollar allotment that can actually cover it, instead of noting it", () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, {
        ...CART,
        items: [{ ...CART.items[0], quantity: 13, progCatIds: [52] }, CART.items[1]],
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 2,
          allotExclTaxFreight: 'N',
          rules: [
            {
              ...MULTI_GRANT_RULE,
              units: { total: 11, used: 4, inCart: 13, available: 7 },
              // Cap is fully spent (`remaining: 0`), not just outgrown by
              // this line's own quantity — that's what makes the move
              // kick in (see the "stays put" test right below).
              covers: {
                allAssortments: 'N' as const,
                categories: [],
                unitGrants: [
                  { progCatId: 52, categoryName: 'Cap', unitQty: 2, remaining: 0, reserved: 0 },
                  { progCatId: 3, categoryName: 'Tactical', unitQty: 9, remaining: 9, reserved: 0 },
                ],
              },
            },
            {
              ruleId: 40,
              ruleName: 'General Allotment',
              allotType: 'DOLLAR' as const,
              primaryUnit: 'DOLLARS' as const,
              isBarRule: 'N' as const,
              dollars: { total: 500, used: 0, inCart: 0, available: 500 },
              units: null,
              points: null,
              cycle: MULTI_GRANT_RULE.cycle,
              covers: { allAssortments: 'Y' as const, categories: [], unitGrants: [] },
              carryover: { type: 'FORFEIT' as const, pct: null, capAmount: null, carriedIn: null },
              quotas: [],
              fallbacks: [],
            },
          ],
          approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            { cartItemId: 9001, skuId: 9001, ruleId: 31, payUnit: 'UNITS' as const, tagLabel: 'uses units', allocations: [] },
          ],
        },
      });
      fixture.detectChanges();

      const row: HTMLElement = fixture.nativeElement.querySelectorAll('.cart-page__row')[0];
      expect(row.querySelector('.pay-tag')?.textContent?.trim()).toBe('$ allotment');
      const groupHeadings: HTMLElement[] = fixture.nativeElement.querySelectorAll('.allotment-group__name');
      expect(Array.from(groupHeadings).map((h) => h.textContent?.trim())).toContain('General Allotment');
      // Genuinely covered by the dollar allotment now — no "exceeded"
      // warning, and Checkout isn't blocked over a line that will really
      // succeed at checkout.
      expect(fixture.nativeElement.textContent).not.toContain('maxed out');
      expect(fixture.nativeElement.textContent).not.toContain('is exceeded');
      expect(fixture.nativeElement.querySelector('a.cart-page__checkout')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('button.cart-page__checkout')).toBeNull();
    });

    it("keeps an over-drawn line under its real units group as long as the category still has real room left, however far the quantity is raised", () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, {
        ...CART,
        items: [{ ...CART.items[0], quantity: 13, progCatIds: [52] }, CART.items[1]],
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 2,
          allotExclTaxFreight: 'N',
          rules: [
            // Cap's own `remaining` (2) hasn't itself been touched by real
            // usage — unlike the test above, there's still something
            // genuine to cover part of this line with, so it must stay put
            // even though 13 are in the cart against a 2-unit grant.
            { ...MULTI_GRANT_RULE, units: { total: 11, used: 4, inCart: 13, available: 7 } },
            {
              ruleId: 40,
              ruleName: 'General Allotment',
              allotType: 'DOLLAR' as const,
              primaryUnit: 'DOLLARS' as const,
              isBarRule: 'N' as const,
              dollars: { total: 500, used: 0, inCart: 0, available: 500 },
              units: null,
              points: null,
              cycle: MULTI_GRANT_RULE.cycle,
              covers: { allAssortments: 'Y' as const, categories: [], unitGrants: [] },
              carryover: { type: 'FORFEIT' as const, pct: null, capAmount: null, carriedIn: null },
              quotas: [],
              fallbacks: [],
            },
          ],
          approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            { cartItemId: 9001, skuId: 9001, ruleId: 31, payUnit: 'UNITS' as const, tagLabel: 'uses units', allocations: [] },
          ],
        },
      });
      fixture.detectChanges();

      const row: HTMLElement = fixture.nativeElement.querySelectorAll('.cart-page__row')[0];
      expect(row.querySelector('.pay-tag')?.textContent?.trim().replace(/\s+/g, ' ')).toBe('uses units · Cap');
      const groupHeadings: HTMLElement[] = fixture.nativeElement.querySelectorAll('.allotment-group__name');
      expect(Array.from(groupHeadings).map((h) => h.textContent?.trim())).not.toContain('General Allotment');
      // Still exceeded/blocked — the real charge is still over the grant.
      expect(fixture.nativeElement.textContent).toContain(
        'Your Unit Allotment for Cap is exceeded. Please adjust qty before checking out.',
      );
    });

    it("falls back to a generic note when the rule has no configured fallback", () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, {
        ...CART,
        items: [{ ...CART.items[0], quantity: 13, progCatIds: [52] }, CART.items[1]],
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 1,
          allotExclTaxFreight: 'N',
          rules: [{ ...MULTI_GRANT_RULE, units: { total: 11, used: 4, inCart: 13, available: 7 } }],
          approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            { cartItemId: 9001, skuId: 9001, ruleId: 31, payUnit: 'UNITS' as const, tagLabel: 'uses units', allocations: [] },
          ],
        },
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        'Your Cap allotment is maxed out — this would really need another allotment or your personal card.',
      );
    });

    it('shows no exhaustion note for a line within its category\'s own room', () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, {
        ...CART,
        items: [{ ...CART.items[0], quantity: 1, progCatIds: [52] }, CART.items[1]],
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 1,
          allotExclTaxFreight: 'N',
          rules: [{ ...MULTI_GRANT_RULE, units: { total: 11, used: 4, inCart: 1, available: 6 } }],
          approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            { cartItemId: 9001, skuId: 9001, ruleId: 31, payUnit: 'UNITS' as const, tagLabel: 'uses units', allocations: [] },
          ],
        },
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('maxed out');
    });

    it("shows this line's own assortment grant balance (Total/Used/In cart/Available), not the rule's pooled total", () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, {
        ...CART,
        items: [{ ...CART.items[0], quantity: 1, progCatIds: [52] }, CART.items[1]],
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 1,
          allotExclTaxFreight: 'N',
          rules: [{ ...MULTI_GRANT_RULE, units: { total: 11, used: 4, inCart: 1, available: 6 } }],
          approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            { cartItemId: 9001, skuId: 9001, ruleId: 31, payUnit: 'UNITS' as const, tagLabel: 'uses units', allocations: [] },
          ],
        },
      });
      fixture.detectChanges();

      const row: HTMLElement = fixture.nativeElement.querySelectorAll('.cart-page__row')[0];
      const values: NodeListOf<HTMLElement> = row.querySelectorAll('.cart-page__item-balance-box .balance-box__value');
      expect(Array.from(values).map((el) => el.textContent?.trim())).toEqual([
        '2 units',
        '0 units',
        '1 units',
        '1 units',
      ]);
    });

    it('shows no per-item balance box for a rule with only one assortment', () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, {
        ...CART,
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 1,
          allotExclTaxFreight: 'N',
          rules: [
            {
              ...MULTI_GRANT_RULE,
              units: { total: 5, used: 0, inCart: 2, available: 3 },
              covers: {
                allAssortments: 'N',
                categories: [],
                unitGrants: [{ progCatId: 52, categoryName: 'Cap', unitQty: 5 }],
              },
            },
          ],
          approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            { cartItemId: 9001, skuId: 9001, ruleId: 31, payUnit: 'UNITS' as const, tagLabel: 'uses units', allocations: [] },
          ],
        },
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.cart-page__item-balance-box')).toBeNull();
    });
  });

  describe('category quota enforcement', () => {
    const POINTS_RULE_WITH_QUOTA = {
      ruleId: 22,
      ruleName: 'Allotment Points',
      allotType: 'POINTS' as const,
      primaryUnit: 'POINTS' as const,
      isBarRule: 'N' as const,
      dollars: null,
      units: null,
      points: { total: 450, used: 120, inCart: 0, available: 330 },
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
      carryover: { type: 'FORFEIT' as const, pct: null, capAmount: null, carriedIn: null },
      quotas: [
        {
          quotaId: 12,
          programId: 3,
          programName: "St John's Fire",
          progCatId: 63,
          categoryName: 'Cap',
          limitType: 'UNITS' as const,
          limitValue: 2,
        },
      ],
      fallbacks: [],
    };

    function cartWithQuotaItem(quantity: number) {
      return {
        ...CART,
        items: [{ ...CART.items[0], quantity, progCatIds: [63] }],
        allotment: {
          programId: 3,
          allotmentBar: null,
          ruleCount: 1,
          allotExclTaxFreight: 'N' as const,
          rules: [POINTS_RULE_WITH_QUOTA],
          approvals: { canApprove: 'N' as const, pendingApprovals: null, awaitingApproval: null },
          openOrders: null,
          lineTags: [
            { cartItemId: 9001, skuId: 9001, ruleId: 22, payUnit: 'POINTS' as const, tagLabel: 'uses points', allocations: [] },
          ],
        },
      };
    }

    it('shows the exact exceeded-quota message and disables Checkout once over the limit', () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, cartWithQuotaItem(5));
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(
        'Your quota for 2 Caps is exceeded. Please adjust qty before checking out.',
      );
      expect(fixture.nativeElement.querySelector('a.cart-page__checkout')).toBeNull();
      const checkoutBtn: HTMLButtonElement = fixture.nativeElement.querySelector('button.cart-page__checkout');
      expect(checkoutBtn.disabled).toBe(true);
    });

    it('shows no warning and allows Checkout once back within the quota', () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, cartWithQuotaItem(2));
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('is exceeded');
      expect(fixture.nativeElement.querySelector('a.cart-page__checkout')).not.toBeNull();
    });
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
      fallbacks: [{ seq: 2, ruleId: 22, ruleName: 'Footwear allotment', unit: 'DOLLARS' as const, available: 40 }],
    };

    const FOOTWEAR_RULE = {
      ...UNIFORM_RULE,
      ruleId: 22,
      ruleName: 'Footwear allotment',
      dollars: { total: 200, used: 0, inCart: 160, available: 40 },
      covers: { allAssortments: 'N' as const, categories: [{ progCatId: 2, categoryName: 'Footwear' }], unitGrants: [] },
      fallbacks: [],
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
      fallbacks: [],
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

    it("shows a group's own fallback rule in its subtitle (\"Then uses: …\"), from the API's fallbacks list", () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, GROUPED_CART);
      fixture.detectChanges();

      const uniformGroup = fixture.nativeElement.querySelectorAll('.allotment-group')[0];
      expect(uniformGroup.querySelector('.allotment-group__subtitle')?.textContent).toContain(
        'Then uses: Footwear',
      );

      // Footwear itself has no configured fallback — nothing to show.
      const footwearGroup = fixture.nativeElement.querySelectorAll('.allotment-group')[1];
      expect(footwearGroup.querySelector('.allotment-group__subtitle')?.textContent).not.toContain('Then uses:');
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

    it('flags a Paid from row with a FALLBACK badge when it\'s absorbing another rule\'s overflow, but not the home rule\'s own row', () => {
      const fixture = TestBed.createComponent(CartPage);
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, GROUPED_CART);
      fixture.detectChanges();

      const summary: HTMLElement = fixture.nativeElement.querySelector('.cart-page__summary');
      const rows: HTMLElement[] = Array.from(summary.querySelectorAll('.cart-page__summary-fallback-tag')).map(
        (tag) => tag.closest('.d-flex')!,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('Footwear allotment');

      const uniformRow = Array.from(summary.querySelectorAll('.d-flex')).find((row) =>
        row.textContent?.includes('Uniform allotment'),
      )!;
      expect(uniformRow.querySelector('.cart-page__summary-fallback-tag')).toBeNull();

      expect(
        summary.querySelector('.cart-page__summary-fallback-note')?.textContent?.trim(),
      ).toBe('for Uniform allotment (Station Shirt)');
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
      // Footwear's own $120.00 (the Boot) and its separate $40.00 fallback
      // draw (absorbing the Shirt's overflow once Uniform ran out) show as
      // two distinct rows now, rather than one pooled $160.00 figure.
      expect(summary.textContent).toContain('$120.00');
      expect(summary.textContent).toContain('$40.00');
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
        fallbacks: [],
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
        fallbacks: [],
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
