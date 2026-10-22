import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, of, shareReplay, tap } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface EmployeeLocation {
  empLocId: number;
  locationId: number;
  locationCode: string;
  locationName: string;
}

// `active` is always `true` when present — this is only ever non-null for a
// shop-as session; a normal employee session gets `null`, never `{active:
// false, ...}`.
export interface Impersonation {
  active: true;
  actorName: string;
  actorLevel: 'L1' | 'L2';
}

export interface EmployeeCustomer {
  custId: number;
  name: string;
  logoUrl: string | null;
}

export interface EmployeeSupportContact {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface EmployeePersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

// `status` is a best guess beyond the one confirmed value ('ACTIVE') — left
// as a plain string rather than a closed union until more values are seen.
export interface EmployeeEmployment {
  roleId: number;
  roleName: string;
  rank: string | null;
  hireDate: string | null;
  employeeNumber: string | null;
  badgeNumber: string | null;
  status: string;
}

// `mfaMethod`/`mfaDestination` are rendered straight from the API as given
// — the exact wording/casing for `mfaMethod` ('Email' vs 'EMAIL', etc.)
// isn't confirmed yet, and `mfaDestination` is assumed to already arrive
// masked (e.g. "j•••••@example.com") rather than something this app masks
// itself.
export interface EmployeeSecurity {
  mfaEnabled: 'Y' | 'N';
  mfaMethod: string | null;
  mfaDestination: string | null;
  passwordChangedTs: string | null;
}

export interface EmployeeProfile {
  customer: EmployeeCustomer;
  support: EmployeeSupportContact;
  personal: EmployeePersonalInfo;
  employment: EmployeeEmployment;
  security: EmployeeSecurity;
}

export interface EmployeeDetails {
  empId: string;
  firstName: string;
  lastName: string;
  locations: EmployeeLocation[];
  // `null` only for a legacy/partial response that predates this block —
  // a real, current `*GET` always sends it.
  profile: EmployeeProfile | null;
  impersonation: Impersonation | null;
}

interface RawEmployeeDetails extends Omit<EmployeeDetails, 'impersonation' | 'profile'> {
  impersonation?: Impersonation | null;
  profile?: EmployeeProfile | null;
}

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private readonly http = inject(HttpClient);
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCEMPLYEE`;

  readonly employee = signal<EmployeeDetails | null>(null);

  private request$: Observable<EmployeeDetails> | null = null;

  /**
   * Fetches the logged-in employee's details once and caches the result —
   * called right after a successful login/MFA verification. Safe to call
   * again from other places (e.g. a future profile page) since later callers
   * reuse the cached value or the same in-flight request.
   */
  load(empId: string, sessionId: string): Observable<EmployeeDetails> {
    const cached = this.employee();
    if (cached) {
      return of(cached);
    }

    if (!this.request$) {
      this.request$ = this.http
        .post<RawEmployeeDetails>(this.dispatchUrl, { empId, sessionId, action: '*GET' })
        .pipe(
          map((raw) => ({ ...raw, impersonation: raw.impersonation ?? null, profile: raw.profile ?? null })),
          tap((employee) => this.employee.set(employee)),
          shareReplay(1),
        );
    }
    return this.request$;
  }

  clear(): void {
    this.employee.set(null);
    this.request$ = null;
  }
}
