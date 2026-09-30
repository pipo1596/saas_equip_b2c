import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

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

// CART, with an allotment that fully covers its one line (179.98) — used to
// check that shipping/tax still produce a credit-card balance even once the
// goods themselves are entirely covered.
const FULLY_COVERED_CART: Cart = {
  ...CART,
  allotment: {
    programId: 3,
    allotmentBar: null,
    ruleCount: 1,
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

  it('should scroll to the top of the page on first render', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    const scrollIntoViewSpy = vi.fn();
    fixture.nativeElement.scrollIntoView = scrollIntoViewSpy;

    fixture.detectChanges();

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
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

  it('should show a credit card section, above Place Order, when there is a balance not covered by an allotment', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, {
      cust_addrs: [PRIMARY_ADDRESS],
      ship_addrs: [PRIMARY_ADDRESS],
      ship_mthds: [DEFAULT_SHIP_METHOD],
      tax_rates: [],
    });
    fixture.detectChanges();

    const leftColumn: HTMLElement = fixture.nativeElement.querySelector('.col-lg-8');
    const ccForm = leftColumn.querySelector('.checkout-page__cc-form');
    const creditCardPanel = ccForm?.closest('.checkout-page__panel') as HTMLElement | null;
    // The full order total (subtotal due 179.98 + shipping 12.50, no tax
    // configured here) — not just the goods-only subtotal-due figure.
    expect(creditCardPanel?.textContent).toContain('$192.48');
    expect(creditCardPanel?.querySelectorAll('.checkout-page__cc-input').length).toBe(4);

    const children = Array.from(leftColumn.children);
    const creditCardIndex = children.indexOf(creditCardPanel!);
    const placeOrderIndex = children.findIndex((el) => el.classList.contains('checkout-page__place-order'));
    expect(creditCardIndex).toBeGreaterThanOrEqual(0);
    expect(placeOrderIndex).toBeGreaterThan(creditCardIndex);
  });

  it('formats the card number into groups of 4 digits, dropping anything else typed', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, { cust_addrs: [], ship_addrs: [], ship_mthds: [], tax_rates: [] });
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[formcontrolname="cardNumber"]');
    input.value = '4111-1111 1111x1111999';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(input.value).toBe('4111 1111 1111 1111');
  });

  it('auto-inserts the slash into the expiry field after the second digit', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, { cust_addrs: [], ship_addrs: [], ship_mthds: [], tax_rates: [] });
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[formcontrolname="expiry"]');
    input.value = '1225';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(input.value).toBe('12/25');
  });

  it('adds the slash as soon as the second digit is typed, not only once a third digit arrives', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, { cust_addrs: [], ship_addrs: [], ship_mthds: [], tax_rates: [] });
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[formcontrolname="expiry"]');
    input.value = '1';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(input.value).toBe('1');

    input.value = '12';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(input.value).toBe('12/');
  });

  it('lets backspacing past the auto-inserted slash reach the bare month digits again', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, { cust_addrs: [], ship_addrs: [], ship_mthds: [], tax_rates: [] });
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[formcontrolname="expiry"]');
    const type = (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };

    type('12');
    expect(input.value).toBe('12/');

    // Backspacing the trailing slash itself must not immediately grow it
    // back — that would trap the shopper at "12/" forever.
    type('12');
    expect(input.value).toBe('12');

    type('1');
    expect(input.value).toBe('1');

    type('');
    expect(input.value).toBe('');
  });

  it('strips non-digits and caps the CVC field at 4 characters', () => {
    const fixture = TestBed.createComponent(CheckoutPage);
    fixture.detectChanges();
    flushInitialCartLoads(httpMock, CART);
    flushCheckoutData(httpMock, { cust_addrs: [], ship_addrs: [], ship_mthds: [], tax_rates: [] });
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[formcontrolname="cvc"]');
    input.value = 'a1b2c3d4e5';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(input.value).toBe('1234');
  });

  it('should hide the credit card section only when nothing at all is owed by card', () => {
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
    expect(fixture.nativeElement.querySelector('.checkout-page__cc-form')).toBeNull();
  });

  it("should still show a credit-card balance for shipping and tax even once the goods are fully covered", () => {
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
    // covering the cost doesn't exempt it from tax.
    const expectedTax = (179.98 + 12.5) * 0.14975;
    const expectedTotal = 12.5 + expectedTax;
    expect(page.subtotalDue()).toBe(0);
    expect(page.taxAmount()).toBeCloseTo(expectedTax, 5);
    expect(page.orderTotal()).toBeCloseTo(expectedTotal, 5);

    const ccForm = fixture.nativeElement.querySelector('.checkout-page__cc-form');
    expect(ccForm).not.toBeNull();
    expect(ccForm.closest('.checkout-page__panel').textContent).toContain('$41.32');
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
});
