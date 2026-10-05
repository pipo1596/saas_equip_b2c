import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../core/auth/auth';
import { FAKE_SESSION } from '../../core/auth/auth.testing';
import { Cart } from '../../core/cart/cart';
import { CheckoutPage } from './checkout-page';

const CART: Cart = {
  cartId: 501,
  itemCount: 2,
  subtotalPrice: 179.98,
  subtotalPoints: null,
  allotment: null,
  items: [
    {
      cartItemId: 9001,
      skuId: 9001,
      quantity: 2,
      priceAtAdd: 89.99,
      pointsAtAdd: null,
      lineTotalPrice: 179.98,
      lineTotalPoints: null,
      productPk: 12345,
      productTitle: "Men's Trail Jacket",
      handle: 'mens-trail-jacket',
      skuCode: 'ABC-100-BLK-M',
      currentPrice: 89.99,
      currentPoints: null,
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

const PRIMARY_ADDRESS = {
  addressId: 42,
  tpId: 3,
  custId: 17,
  addressLine1: '1250 Rue Sherbrooke O',
  addressLine2: 'Suite 400',
  addressLine3: null,
  attention: 'Receiving Dept.',
  phone: '514-555-0142',
  city: 'Montreal',
  province: 'QC',
  postalCode: 'H3G 1H6',
  country: 'CA',
  addressType: 'BOTH' as const,
  isPrimary: 'Y' as const,
};

const SECONDARY_ADDRESS = {
  ...PRIMARY_ADDRESS,
  addressId: 43,
  attention: 'Warehouse',
  addressLine1: '400 Bay St',
  addressLine2: null,
  city: 'Toronto',
  province: 'ON',
  postalCode: 'M5H 2Y4',
  isPrimary: 'N' as const,
};

const DEFAULT_SHIP_METHOD = {
  shipMethodId: 5,
  tpId: 3,
  custId: 17,
  methodName: 'Standard Ground',
  carrier: 'Canada Post',
  serviceCode: 'Regular Parcel',
  estimatedDelivery: '5-7 business days',
  rateType: 'FLAT',
  flatAmount: 12.5,
  paidBy: 'EMPLOYEE',
  minOrderAmount: null,
  isDefault: 'Y' as const,
  sortOrder: 0,
};

const EXPRESS_SHIP_METHOD = {
  ...DEFAULT_SHIP_METHOD,
  shipMethodId: 6,
  methodName: 'Express',
  estimatedDelivery: '1-2 business days',
  flatAmount: 25,
  isDefault: 'N' as const,
  sortOrder: 1,
};

const QC_TAX_RATE = { province: 'QC', tax_rate: 14.975 };
const ON_TAX_RATE = { province: 'ON', tax_rate: 13.0 };

// CART, with an allotment that fully covers its one line (179.98) and
// explicitly excludes shipping/tax from that coverage (`allotExclTaxFreight:
// 'Y'`) — used to check that shipping/tax still produce a credit-card
// balance even once the goods themselves are entirely covered.
const FULLY_COVERED_CART: Cart = {
  ...CART,
  allotment: {
    programId: 3,
    allotmentBar: null,
    ruleCount: 1,
    allotExclTaxFreight: 'Y',
    rules: [
      {
        ruleId: 99,
        ruleName: 'General Allotment',
        allotType: 'DOLLAR',
        primaryUnit: 'DOLLARS',
        isBarRule: 'Y',
        dollars: { total: 500, used: 0, inCart: 179.98, available: 320.02 },
        units: null,
        points: null,
        cycle: {
          renewalBasis: 'FIXED',
          renewalPeriodMonths: 12,
          cycleStart: null,
          cycleEnd: null,
          renewsOn: null,
          expirationDate: null,
          onExpiration: 'SUSPEND',
        },
        covers: { allAssortments: 'Y', categories: [], unitGrants: [] },
        carryover: { type: 'FORFEIT', pct: null, capAmount: null, carriedIn: null },
        quotas: [],
        requireApproval: 'N',
        allowCcFallback: 'N',
        fallbackRuleIds: [],
      },
    ],
    approvals: { canApprove: 'N', pendingApprovals: null, awaitingApproval: null },
    openOrders: null,
    lineTags: [
      {
        cartItemId: 9001,
        skuId: 9001,
        ruleId: 99,
        payUnit: 'DOLLARS',
        tagLabel: '$ allotment',
        allocations: [{ ruleId: 99, payUnit: 'DOLLARS', amount: 179.98 }],
      },
    ],
    productTag: null,
  },
};

// Same coverage as FULLY_COVERED_CART, but the allotment also covers
// shipping/tax (`allotExclTaxFreight: 'N'`) — used to check that they no
// longer produce a credit-card balance in that case.
const CART_WITH_SHIPPING_AND_TAX_COVERED: Cart = {
  ...FULLY_COVERED_CART,
  allotment: { ...FULLY_COVERED_CART.allotment!, allotExclTaxFreight: 'N' },
};

function flushInitialCartLoads(httpMock: HttpTestingController, response: object) {
  const matches = httpMock.match(
    (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCCART' && req.body?.action === '*GET',
  );
  expect(matches.length).toBeGreaterThan(0);
  matches.forEach((req) => req.flush(response as never));
}

// `<app-header/>` (rendered by this page too) independently fires its own
// `*GET` against this exact same SEPGM/URL for tenant branding — filter by
// action, not just URL, to tell it apart from this page's own `*GET_FULL`.
function flushCheckoutData(httpMock: HttpTestingController, response: object) {
  const matches = httpMock.match(
    (req) => req.url === '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS' && req.body?.action === '*GET_FULL',
  );
  expect(matches.length).toBe(1);
  matches[0].flush(response as never);
}

describe('CheckoutPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [CheckoutPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should pre-fill the contact form from the logged-in session, formatting the phone number', () => {
    TestBed.inject(AuthService).session.set(FAKE_SESSION);

    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;

    expect(page.contactForm.controls.firstName.value).toBe(FAKE_SESSION.firstName);
    expect(page.contactForm.controls.lastName.value).toBe(FAKE_SESSION.lastName);
    expect(page.contactForm.controls.email.value).toBe(FAKE_SESSION.email);
    expect(page.contactForm.controls.phone.value).toBe('(780) 555-0100');
  });

  it('should require email, first/last name, and phone on the contact form, but not extension', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    expect(page.contactForm.invalid).toBe(true);

    page.contactForm.setValue({
      email: 'not-an-email',
      firstName: 'Pat',
      lastName: 'Doe',
      phone: '555-0100',
      extension: '',
    });
    expect(page.contactForm.controls.email.hasError('email')).toBe(true);
    expect(page.contactForm.controls.extension.valid).toBe(true);

    page.contactForm.controls.email.setValue('pat.doe@example.com');
    expect(page.contactForm.valid).toBe(true);
  });

  it('should format the phone field live as digits are typed, and while deleting', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    const phone = page.contactForm.controls.phone;

    phone.setValue('7');
    expect(phone.value).toBe('(7');
    phone.setValue('780555');
    expect(phone.value).toBe('(780) 555');
    phone.setValue('7805550100');
    expect(phone.value).toBe('(780) 555-0100');

    // Backspacing the last digit should shrink the formatted value, not
    // get stuck re-inserting whatever separator was just deleted.
    phone.setValue('(780) 555-010');
    expect(phone.value).toBe('(780) 555-010');

    // A stray 11th digit is dropped rather than overflowing the mask.
    phone.setValue('78055501009');
    expect(phone.value).toBe('(780) 555-0100');
  });

  it('should render the contact information fields', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, { cust_addrs: [], ship_addrs: [], ship_mthds: [], tax_rates: [] });
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector<HTMLInputElement>('#contact-email')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('#contact-first-name')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('#contact-last-name')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('#contact-phone')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('#contact-extension')).not.toBeNull();
  });

  it('should scroll to the top of the page on first render', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const scrollIntoViewSpy = vi.fn();
    fixture.nativeElement.scrollIntoView = scrollIntoViewSpy;

    fixture.detectChanges();

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('should show each item\'s unit price alongside its line total, only when more than one was ordered', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, {
      ...CART,
      items: [...CART.items, { ...CART.items[0], cartItemId: 9002, quantity: 1, lineTotalPrice: 89.99 }],
    });
    flushCheckoutData(httpMock, { cust_addrs: [], ship_addrs: [], ship_mthds: [], tax_rates: [] });
    fixture.detectChanges();

    const rows: HTMLElement[] = fixture.nativeElement.querySelectorAll('.checkout-page__item-price');
    expect(rows[0].querySelector('.checkout-page__item-linetotal')?.textContent).toContain('179.98');
    expect(rows[0].querySelector('.checkout-page__item-unit-price')?.textContent).toContain('89.99');

    expect(rows[1].querySelector('.checkout-page__item-linetotal')?.textContent).toContain('89.99');
    expect(rows[1].querySelector('.checkout-page__item-unit-price')).toBeNull();
  });

  it('should load the cart and checkout data, defaulting to the primary address and default shipping method', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();

    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS, SECONDARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS, SECONDARY_ADDRESS],
      ship_mthds: [DEFAULT_SHIP_METHOD, EXPRESS_SHIP_METHOD],
      tax_rates: [QC_TAX_RATE, ON_TAX_RATE],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Men's Trail Jacket");
    expect(page.selectedAddressId()).toBe(42);
    expect(page.selectedShipMethodId()).toBe(5);
    expect(fixture.nativeElement.querySelector('.checkout-page__address-preview')?.textContent).toContain(
      'Receiving Dept.',
    );
  });

  it('should let selecting a different address and shipping method update the totals', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS, SECONDARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS, SECONDARY_ADDRESS],
      ship_mthds: [DEFAULT_SHIP_METHOD, EXPRESS_SHIP_METHOD],
      tax_rates: [QC_TAX_RATE, ON_TAX_RATE],
    });
    fixture.detectChanges();

    expect(page.shippingCost()).toBe(12.5);
    expect(page.taxRate()).toBe(14.975);

    page.selectAddress(43);
    page.selectShipMethod(6);
    fixture.detectChanges();

    expect(page.selectedAddress()?.city).toBe('Toronto');
    expect(page.shippingCost()).toBe(25);
    expect(page.taxRate()).toBe(13.0);
  });

  it('should default the shipping method dropdown to the default method, and show its carrier/eta in the preview', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS],
      ship_mthds: [DEFAULT_SHIP_METHOD, EXPRESS_SHIP_METHOD],
      tax_rates: [],
    });
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('.checkout-page__method-select');
    expect(select.value).toBe('5');

    const preview: HTMLElement = fixture.nativeElement.querySelector('.checkout-page__method-preview');
    expect(preview.textContent).toContain('Canada Post');
    expect(preview.textContent).toContain('5-7 business days');
  });

  it('should update the selected shipping method when the dropdown itself is changed', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS],
      ship_mthds: [DEFAULT_SHIP_METHOD, EXPRESS_SHIP_METHOD],
      tax_rates: [],
    });
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('.checkout-page__method-select');
    select.value = '6';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(page.selectedShipMethodId()).toBe(6);
    const preview: HTMLElement = fixture.nativeElement.querySelector('.checkout-page__method-preview');
    expect(preview.textContent).toContain('1-2 business days');
  });

  it('should open the address picker from the Edit link, and hide it when there are no addresses to pick from', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS, SECONDARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS, SECONDARY_ADDRESS],
      ship_mthds: [DEFAULT_SHIP_METHOD],
      tax_rates: [QC_TAX_RATE, ON_TAX_RATE],
    });
    fixture.detectChanges();

    expect(page.addressPickerOpen()).toBe(false);
    fixture.nativeElement.querySelector('.checkout-page__edit-link').click();
    expect(page.addressPickerOpen()).toBe(true);

    const options: HTMLElement[] = fixture.nativeElement.querySelectorAll(
      'dialog .checkout-option',
    );
    expect(options.length).toBe(2);
    expect(options[0].textContent).toContain('Receiving Dept.');
    expect(options[1].textContent).toContain('Warehouse');
  });

  it('should select an address and close the picker when one is chosen', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS, SECONDARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS, SECONDARY_ADDRESS],
      ship_mthds: [DEFAULT_SHIP_METHOD],
      tax_rates: [QC_TAX_RATE, ON_TAX_RATE],
    });
    fixture.detectChanges();

    page.openAddressPicker();
    fixture.detectChanges();

    const options: HTMLInputElement[] = fixture.nativeElement.querySelectorAll(
      'dialog .checkout-option input[type="radio"]',
    );
    options[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(page.selectedAddressId()).toBe(43);
    expect(page.addressPickerOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('.checkout-page__address-preview')?.textContent).toContain(
      'Warehouse',
    );
  });

  it('should close the picker via Cancel without changing the selected address', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS, SECONDARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS, SECONDARY_ADDRESS],
      ship_mthds: [DEFAULT_SHIP_METHOD],
      tax_rates: [QC_TAX_RATE, ON_TAX_RATE],
    });
    fixture.detectChanges();

    page.openAddressPicker();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('dialog .modal-footer .btn-outline-secondary').click();

    expect(page.addressPickerOpen()).toBe(false);
    expect(page.selectedAddressId()).toBe(42);
  });

  it('should not show an Edit link when there are no addresses on file', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, { cust_addrs: [], ship_addrs: [], ship_mthds: [], tax_rates: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.checkout-page__edit-link')).toBeNull();
  });

  it('should charge no tax for a non-Canadian address', () => {
    const usAddress = { ...PRIMARY_ADDRESS, addressId: 44, country: 'US', province: 'NY' };
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [usAddress],
      ship_addrs: [usAddress],
      ship_mthds: [DEFAULT_SHIP_METHOD],
      tax_rates: [QC_TAX_RATE, ON_TAX_RATE],
    });
    fixture.detectChanges();

    expect(page.taxRate()).toBe(0);
    expect(page.taxAmount()).toBe(0);
    expect(fixture.nativeElement.textContent).not.toContain('Tax (');
  });

  it("should compute the order total from what's due, plus shipping, plus tax", () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS],
      ship_mthds: [DEFAULT_SHIP_METHOD],
      tax_rates: [QC_TAX_RATE],
    });
    fixture.detectChanges();

    // subtotalDue 179.98 + shipping 12.50 = 192.48, taxed at 14.975%
    const expectedTax = 192.48 * 0.14975;
    expect(page.subtotalDue()).toBe(179.98);
    expect(page.taxAmount()).toBeCloseTo(expectedTax, 5);
    expect(page.orderTotal()).toBeCloseTo(179.98 + 12.5 + expectedTax, 5);
  });

  it("should block placing the order and explain why when there's a balance not covered by an allotment", () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS],
      ship_mthds: [DEFAULT_SHIP_METHOD],
      tax_rates: [],
    });
    fixture.detectChanges();

    // Full order total (subtotal due 179.98 + shipping 12.50, no tax
    // configured here) — credit card payment isn't collected at all yet,
    // so any balance at all blocks the order outright.
    expect(page.orderTotal()).toBeCloseTo(192.48, 5);

    const warning: HTMLElement = fixture.nativeElement.querySelector('.alert-warning');
    expect(warning?.textContent).toContain('$192.48');

    const placeOrder: HTMLElement = fixture.nativeElement.querySelector('.checkout-page__place-order');
    expect(placeOrder.hasAttribute('disabled')).toBe(true);
    expect(placeOrder.querySelector('.checkout-page__place-order-sub')?.textContent).toContain(
      'Balance must be $0.00',
    );
  });

  it('should show no balance warning once nothing at all is owed by card, but still require the other fields', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, FULLY_COVERED_CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS],
      ship_mthds: [],
      tax_rates: [],
    });
    fixture.detectChanges();

    expect(page.subtotalDue()).toBe(0);
    expect(page.orderTotal()).toBe(0);
    expect(fixture.nativeElement.querySelector('.alert-warning')).toBeNull();

    // No balance owed, but there's no shipping method on file (and the
    // contact form is still empty) — the order still can't be placed.
    expect(page.canPlaceOrder()).toBe(false);
    const placeOrder: HTMLElement = fixture.nativeElement.querySelector('.checkout-page__place-order');
    expect(placeOrder.querySelector('.checkout-page__place-order-sub')?.textContent?.trim()).toBe(
      'Complete the required fields to continue',
    );
  });

  it("should still block the order for shipping and tax even once the goods themselves are fully covered", () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, FULLY_COVERED_CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS],
      ship_mthds: [DEFAULT_SHIP_METHOD],
      tax_rates: [QC_TAX_RATE],
    });
    fixture.detectChanges();

    // subtotalDue is 0 (goods fully covered), but tax still applies to the
    // full $179.98 of goods plus the $12.50 shipping — an allotment
    // covering the cost doesn't exempt it from tax — so there's still a
    // balance that would need a credit card, and the order stays blocked.
    const expectedTax = (179.98 + 12.5) * 0.14975;
    const expectedTotal = 12.5 + expectedTax;
    expect(page.subtotalDue()).toBe(0);
    expect(page.taxAmount()).toBeCloseTo(expectedTax, 5);
    expect(page.orderTotal()).toBeCloseTo(expectedTotal, 5);

    expect(fixture.nativeElement.querySelector('.alert-warning')?.textContent).toContain('$41.32');
  });

  it('should not charge shipping/tax to the card when the allotment explicitly covers them too', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART_WITH_SHIPPING_AND_TAX_COVERED);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS],
      ship_mthds: [DEFAULT_SHIP_METHOD],
      tax_rates: [QC_TAX_RATE],
    });
    fixture.detectChanges();

    // Shipping/tax still compute and display for reference, but — unlike
    // the `allotExclTaxFreight: 'Y'` case above — don't add to the balance
    // that would need a credit card.
    expect(page.shippingCost()).toBe(12.5);
    expect(page.taxAmount()).toBeGreaterThan(0);
    expect(page.shippingAndTaxCoveredByAllotment()).toBe(true);
    expect(page.subtotalDue()).toBe(0);
    expect(page.orderTotal()).toBe(0);

    expect(fixture.nativeElement.querySelector('.alert-warning')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('(covered by allotment)');
  });

  it('should show empty-state notes when there are no addresses or shipping methods on file', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, { cust_addrs: [], ship_addrs: [], ship_mthds: [], tax_rates: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No shipping address on file');
    expect(fixture.nativeElement.textContent).toContain('No shipping method on file');
  });

  it('should show the empty state when the cart has nothing in it', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, {
      cartId: null,
      itemCount: 0,
      subtotalPrice: 0,
      subtotalPoints: null,
      items: [],
    });
    flushCheckoutData(httpMock, { cust_addrs: [], ship_addrs: [], ship_mthds: [], tax_rates: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Your cart is empty.');
  });

  it('should surface the API message when checkout data fails to load', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, { success: false, message: 'Not logged in.' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.alert')?.textContent).toContain('Not logged in.');
  });

  describe('placing an order', () => {
    it('should re-evaluate canPlaceOrder once the contact form becomes valid, with no other signal changing', () => {
      // No email/phone here (unlike the rest of this describe block) so
      // the contact form actually starts out invalid/blank, which is what
      // this test is exercising.
      TestBed.inject(AuthService).session.set({
        ...FAKE_SESSION,
        email: '',
        phone: '',
        locations: [{ empLocId: 1, locationId: 77, locationCode: '001', locationName: 'HQ' }],
      });

      const fixture = TestBed.createComponent(CheckoutPage);
      const page = fixture.componentInstance;
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, CART_WITH_SHIPPING_AND_TAX_COVERED);
      flushCheckoutData(httpMock, {
        cust_addrs: [PRIMARY_ADDRESS],
        ship_addrs: [PRIMARY_ADDRESS],
        ship_mthds: [DEFAULT_SHIP_METHOD],
        tax_rates: [],
      });
      fixture.detectChanges();

      // Reading it once here — while the form is still blank — is what
      // used to poison the memoized computed(): since `FormGroup.valid` is
      // a plain getter (not a signal), `canPlaceOrder` never re-ran once
      // the form changed, so it kept returning this first, stale `false`.
      expect(page.canPlaceOrder()).toBe(false);

      page.contactForm.setValue({
        email: 'pat.doe@example.com',
        firstName: 'Pat',
        lastName: 'Doe',
        phone: '555-0100',
        extension: '',
      });

      expect(page.canPlaceOrder()).toBe(true);
    });

    function setUpReadyToPlace(): { fixture: ReturnType<typeof TestBed.createComponent<CheckoutPage>>; page: CheckoutPage } {
      TestBed.inject(AuthService).session.set({
        ...FAKE_SESSION,
        locations: [{ empLocId: 1, locationId: 77, locationCode: '001', locationName: 'HQ' }],
      });

      const fixture = TestBed.createComponent(CheckoutPage);
      const page = fixture.componentInstance;
      fixture.detectChanges();
      flushInitialCartLoads(httpMock, CART_WITH_SHIPPING_AND_TAX_COVERED);
      flushCheckoutData(httpMock, {
        cust_addrs: [PRIMARY_ADDRESS],
        ship_addrs: [PRIMARY_ADDRESS],
        ship_mthds: [DEFAULT_SHIP_METHOD],
        tax_rates: [],
      });
      fixture.detectChanges();

      page.contactForm.setValue({
        email: 'pat.doe@example.com',
        firstName: 'Pat',
        lastName: 'Doe',
        phone: '780-555-0100',
        extension: '',
      });

      expect(page.canPlaceOrder()).toBe(true);
      return { fixture, page };
    }

    function flushOrderRequest(response: object) {
      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body.action).toBe('*PLACE');
      req.flush(response as never);
      return req;
    }

    // No `/orders/:orderId` route is registered in this spec's bare
    // `provideRouter([])` — mocked (not just spied on) so a real `navigate`
    // call doesn't reject with "Cannot match any routes" as an unhandled
    // rejection in every test that successfully places an order, not only
    // the one below that actually asserts on it.
    function mockNavigate() {
      return vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    }

    it('should place the order with the expected payload, refresh the cart, and navigate to the confirmation page', () => {
      const { page } = setUpReadyToPlace();
      const navigateSpy = mockNavigate();

      page.placeOrder();

      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(req.request.body).toEqual({
        action: '*PLACE',
        locationId: 77,
        checkoutKey: expect.any(String),
        addressId: PRIMARY_ADDRESS.addressId,
        shipMethodId: DEFAULT_SHIP_METHOD.shipMethodId,
        email: 'pat.doe@example.com',
        firstName: 'Pat',
        lastName: 'Doe',
        phone: '(780) 555-0100',
      });
      expect(req.request.body.checkoutKey).not.toBe('');

      req.flush({
        success: true,
        message: 'Order EQ100001 placed.',
        orderId: 42,
        orderNumber: 'EQ100001',
        status: 'PROCESSING',
      });

      // The server already emptied the cart — this page refreshes the
      // shared signal so the header's badge/drawer reflect that too.
      httpMock
        .expectOne((r) => r.url === '/cgi/APPSCDSPCH?SEPGM=APCCART' && r.body?.action === '*GET')
        .flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] });

      expect(page.submitting()).toBe(false);
      expect(navigateSpy).toHaveBeenCalledWith(['/orders', 42], { state: { justPlaced: true } });
    });

    it('should include phoneExt only when an extension was entered', () => {
      const { page } = setUpReadyToPlace();
      mockNavigate();
      page.contactForm.controls.extension.setValue('204');

      page.placeOrder();

      const req = flushOrderRequest({
        success: true,
        message: 'Order EQ100001 placed.',
        orderId: 42,
        orderNumber: 'EQ100001',
        status: 'PROCESSING',
      });
      expect(req.request.body.phoneExt).toBe('204');
      httpMock
        .expectOne((r) => r.url === '/cgi/APPSCDSPCH?SEPGM=APCCART' && r.body?.action === '*GET')
        .flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] });
    });

    it('should show a PCH cart-changed message as a warning, reload the cart, and mint a new checkoutKey', () => {
      const { page } = setUpReadyToPlace();
      mockNavigate();

      page.placeOrder();
      const firstReq = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      const firstKey = firstReq.request.body.checkoutKey;
      firstReq.flush({ success: false, code: 'PCH', message: '2 item(s) in your cart changed price.' });

      // PCH reloads the cart — flush that incidental request.
      httpMock
        .expectOne((r) => r.url === '/cgi/APPSCDSPCH?SEPGM=APCCART' && r.body?.action === '*GET')
        .flush(CART_WITH_SHIPPING_AND_TAX_COVERED);

      expect(page.submitting()).toBe(false);
      expect(page.placeOrderWarning()).toBe('2 item(s) in your cart changed price.');
      expect(page.placeOrderError()).toBeNull();

      page.placeOrder();
      const secondReq = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(secondReq.request.body.checkoutKey).not.toBe(firstKey);
      secondReq.flush({
        success: true,
        message: 'Order EQ100001 placed.',
        orderId: 43,
        orderNumber: 'EQ100002',
        status: 'PROCESSING',
      });
      httpMock
        .expectOne((r) => r.url === '/cgi/APPSCDSPCH?SEPGM=APCCART' && r.body?.action === '*GET')
        .flush({ cartId: null, itemCount: 0, subtotalPrice: 0, subtotalPoints: null, items: [] });
    });

    it('should show an INS (insufficient allotment) message as a blocking error and keep the same checkoutKey for Retry', () => {
      const { page } = setUpReadyToPlace();

      page.placeOrder();
      const firstReq = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      const firstKey = firstReq.request.body.checkoutKey;
      firstReq.flush({ success: false, code: 'INS', message: 'Not enough allotment for SKU ABC-100.' });

      expect(page.placeOrderError()).toBe('Not enough allotment for SKU ABC-100.');
      expect(page.placeOrderWarning()).toBeNull();

      // Retry reuses the same checkoutKey — the server can use it to
      // recognize this as the same attempt, not a brand new order.
      page.placeOrder();
      const secondReq = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(secondReq.request.body.checkoutKey).toBe(firstKey);
      secondReq.flush({ success: false, code: 'INS', message: 'Not enough allotment for SKU ABC-100.' });
    });

    it('should show a generic message and keep the same checkoutKey on a network error', () => {
      const { page } = setUpReadyToPlace();

      page.placeOrder();
      const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      const firstKey = req.request.body.checkoutKey;
      req.error(new ProgressEvent('error'), { status: 0 });

      expect(page.submitting()).toBe(false);
      expect(page.placeOrderError()).toBe('We could not reach the order service. Please try again.');

      page.placeOrder();
      const retryReq = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCORDER');
      expect(retryReq.request.body.checkoutKey).toBe(firstKey);
      retryReq.flush({ success: false, code: 'ERR', message: 'Still busy.' });
    });

    it('should mark the contact form touched and not submit when it is invalid', () => {
      const { page } = setUpReadyToPlace();
      page.contactForm.controls.email.setValue('');

      page.placeOrder();

      expect(page.contactForm.controls.email.touched).toBe(true);
      httpMock.expectNone('/cgi/APPSCDSPCH?SEPGM=APCORDER');
    });
  });
});
