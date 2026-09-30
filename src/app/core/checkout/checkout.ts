import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';

// Every address row `*GET_FULL` returns is the same shape, whether it came
// back in `cust_addrs` (every active address) or `ship_addrs` (just the
// SHIP-TO/BOTH ones) — `addressType` is what tells the two apart when a
// row shows up in both.
export interface CustomerAddress {
  addressId: number;
  tpId: number;
  custId: number;
  addressLine1: string;
  addressLine2: string | null;
  addressLine3: string | null;
  attention: string | null;
  phone: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  addressType: 'BILL-TO' | 'SHIP-TO' | 'BOTH';
  isPrimary: 'Y' | 'N';
}

export interface CustomerShippingMethod {
  shipMethodId: number;
  tpId: number;
  custId: number;
  methodName: string;
  carrier: string;
  serviceCode: string;
  estimatedDelivery: string;
  // Only `FLAT` is a known, handled value today — `flatAmount` is the only
  // rate field the API sends, so anything else has no cost to show yet.
  rateType: string;
  flatAmount: number | null;
  paidBy: string;
  minOrderAmount: number | null;
  isDefault: 'Y' | 'N';
  sortOrder: number;
}

// Not tenant-scoped — a flat Canada-wide table, one row per province.
// `tax_rate` keeps the API's own field name (everything else here is
// camelCase) since that's the literal shape given for this row.
export interface ProvinceTaxRate {
  province: string;
  tax_rate: number;
}

export interface CheckoutData {
  custAddrs: CustomerAddress[];
  shipAddrs: CustomerAddress[];
  shipMthds: CustomerShippingMethod[];
  taxRates: ProvinceTaxRate[];
}

interface RawCheckoutData {
  cust_addrs: CustomerAddress[] | null;
  ship_addrs: CustomerAddress[] | null;
  ship_mthds: CustomerShippingMethod[] | null;
  tax_rates: ProvinceTaxRate[] | null;
}

interface ApiFailure {
  success: false;
  message: string | null;
}

@Injectable({ providedIn: 'root' })
export class CheckoutService {
  private readonly http = inject(HttpClient);
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS`;

  // Addresses and shipping methods are keyed off the logged-in customer
  // (TP_ID/CUST_ID resolved server-side from the session), not anything
  // the client passes — same as the plain `*GET` tenant-settings call.
  load(): Observable<CheckoutData> {
    return this.http.post<RawCheckoutData | ApiFailure>(this.dispatchUrl, { action: '*GET_FULL' }).pipe(
      map((response) => {
        // Key *absent* means failure, matching every other endpoint in
        // this app — `cust_addrs: null` is just the "API sends null
        // instead of []" quirk normalized below, not an error.
        if (!('cust_addrs' in response)) {
          throw new Error((response as ApiFailure).message ?? 'We could not load checkout details.');
        }
        return {
          custAddrs: response.cust_addrs ?? [],
          shipAddrs: response.ship_addrs ?? [],
          shipMthds: response.ship_mthds ?? [],
          taxRates: response.tax_rates ?? [],
        };
      }),
    );
  }
}
