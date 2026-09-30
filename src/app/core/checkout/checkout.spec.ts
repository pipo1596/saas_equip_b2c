import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CheckoutData, CheckoutService } from './checkout';

const ADDRESS = {
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

const SHIP_METHOD = {
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

const TAX_RATE = { province: 'ON', tax_rate: 13.0 };

describe('CheckoutService', () => {
  let service: CheckoutService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CheckoutService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('posts *GET_FULL with no extra params', () => {
    service.load().subscribe();

    const req = httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS');
    expect(req.request.body).toEqual({ action: '*GET_FULL' });
    req.flush({
      cust_addrs: [ADDRESS],
      ship_addrs: [ADDRESS],
      ship_mthds: [SHIP_METHOD],
      tax_rates: [TAX_RATE],
    });
  });

  it('normalizes the four arrays into camelCase fields', () => {
    let result: CheckoutData | undefined;
    service.load().subscribe((data) => (result = data));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush({
      cust_addrs: [ADDRESS],
      ship_addrs: [ADDRESS],
      ship_mthds: [SHIP_METHOD],
      tax_rates: [TAX_RATE],
    });

    expect(result).toEqual({
      custAddrs: [ADDRESS],
      shipAddrs: [ADDRESS],
      shipMthds: [SHIP_METHOD],
      taxRates: [TAX_RATE],
    });
  });

  it('normalizes a null array to []', () => {
    let result: CheckoutData | undefined;
    service.load().subscribe((data) => (result = data));

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush({
      cust_addrs: null,
      ship_addrs: null,
      ship_mthds: null,
      tax_rates: null,
    });

    expect(result).toEqual({ custAddrs: [], shipAddrs: [], shipMthds: [], taxRates: [] });
  });

  it('errors with the API message when the response carries no cust_addrs key', () => {
    let error: unknown;
    service.load().subscribe({ error: (err) => (error = err) });

    httpMock
      .expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS')
      .flush({ success: false, message: 'Not logged in.' });

    expect((error as Error).message).toBe('Not logged in.');
  });

  it('falls back to a generic message when the API omits one', () => {
    let error: unknown;
    service.load().subscribe({ error: (err) => (error = err) });

    httpMock.expectOne('/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS').flush({ success: false, message: null });

    expect((error as Error).message).toBe('We could not load checkout details.');
  });
});
