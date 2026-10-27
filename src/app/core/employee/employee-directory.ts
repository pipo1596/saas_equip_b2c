// `APCTPCEMP`/`APCTPCEMCA` — same dispatcher/session pattern as `APCORDER`/
// `APCCART`: read actions (`*LIST`/`*GET`/`*LIST_ALL`) return the data
// object directly, with a failure distinguished only by an explicit
// `success: false` (a real `EmployeePage`/`EmployeeDetail` never has a
// `success` key at all). Which of the two programs to call depends on the
// customer's data residency (`data_resid` from `APCTPSTNGS`) —
// `APCTPCEMCA` for `'CA'`, `APCTPCEMP` for anything else (including
// not-yet-loaded) — resolved via `TenantSettingsService.load()`, which
// caches the setting for the rest of the session so this never re-fetches
// it per search. `APCTPCROLE` (the Role filter's own data) doesn't depend
// on residency at all.

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { TenantSettingsService } from '../tenant/tenant-settings';

export interface ApiError {
  success: false;
  message: string;
}

export interface EmployeeLocationRef {
  locationId: number;
  locationName: string;
}

// Trimmed to just what the search grid actually shows — the API's own row
// also carries badge #, phone, hire date, MFA and last-login/audit fields
// the grid has no use for (see `EmployeeDetail`, and the API guide's own
// "don't display them" note).
export interface EmployeeSummary {
  empId: number;
  empNum: string | null;
  firstName: string;
  lastName: string;
  emailAddress: string;
  roleName: string | null;
  // Left as a plain string rather than a closed union until more values are
  // confirmed, same reasoning as `EmployeeEmployment.status`.
  empRank: string | null;
  status: string;
  locations: EmployeeLocationRef[];
}

export interface EmployeePagination {
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}

export interface EmployeePage {
  pagination: EmployeePagination;
  data: EmployeeSummary[];
}

export interface EmployeeRole {
  roleId: number;
  roleName: string;
  isActive: 'Y' | 'N';
  description: string | null;
}

// The `*GET` detail screen's own shape — same identity as `EmployeeSummary`
// plus everything the grid leaves out, since a dedicated details screen has
// room for it. `locationCount` stands in for the list's own `locations`
// array (the API gives a count here, not the full list).
export interface EmployeeDetail {
  empId: number;
  empNum: string | null;
  badgeNum: string | null;
  firstName: string;
  lastName: string;
  emailAddress: string;
  phoneNumber: string | null;
  roleName: string | null;
  empRank: string | null;
  hireDate: string | null;
  status: string;
  mfaEnabled: 'Y' | 'N';
  mfaMethod: string | null;
  lastLoginTs: string | null;
  locationCount: number;
}

export interface ListEmployeesParams {
  // Free text, matched anywhere in email/first name/last name/employee
  // number/badge number — blank (the default) matches everyone.
  search?: string;
  // 0/omitted means every role — never sent at all for "All roles" rather
  // than sent as a literal `0`, since the field is simply optional.
  roleId?: number;
  // Exact match, not a partial search — same casing-insensitivity as the
  // API itself.
  empRank?: string;
  hireFrom?: string;
  hireTo?: string;
  page: number;
  pageSize: number;
}

interface RawEmployeeSummary extends Omit<EmployeeSummary, 'locations'> {
  locations: EmployeeLocationRef[] | null;
}

interface RawEmployeePage extends Omit<EmployeePage, 'data'> {
  data: RawEmployeeSummary[] | null;
}

interface RawEmployeeDetail extends Omit<EmployeeDetail, 'locationCount'> {
  locationCount: number | null;
}

// "No records matched the search criteria." (and the Role filter's own
// "No roles matched the search criteria.") come back as a *failure*, not an
// empty success — read as a plain empty result rather than an error, per
// the API guide. A future backend change to a real empty `data`/
// `totalRows: 0` response instead needs no change here; it already flows
// through the normal success path.
function isEmptyResultMessage(message: string): boolean {
  return (
    message === 'No records matched the search criteria.' ||
    message === 'No roles matched the search criteria.'
  );
}

function emptyPage(page: number, pageSize: number): EmployeePage {
  return { pagination: { page, pageSize, totalRows: 0, totalPages: 1 }, data: [] };
}

// Tolerant of a non-ISO date string — the API guide flags `hireDate` on the
// Canada-residency program as not yet confirmed to be `YYYY-MM-DD`.
export function formatHireDate(value: string | null): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

@Injectable({ providedIn: 'root' })
export class EmployeeDirectoryService {
  private readonly http = inject(HttpClient);
  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly rolesDispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCTPCROLE`;

  list(params: ListEmployeesParams): Observable<EmployeePage | ApiError> {
    return this.withEmployeeDispatchUrl((dispatchUrl) =>
      this.http.post<RawEmployeePage | ApiError>(dispatchUrl, {
        action: '*LIST',
        search: params.search ?? '',
        ...(params.roleId ? { roleId: params.roleId } : {}),
        ...(params.empRank ? { empRank: params.empRank } : {}),
        ...(params.hireFrom ? { hireFrom: params.hireFrom } : {}),
        ...(params.hireTo ? { hireTo: params.hireTo } : {}),
        page: params.page,
        pageSize: params.pageSize,
      }),
    ).pipe(
      map((response): EmployeePage | ApiError => {
        if ('success' in response) {
          return isEmptyResultMessage(response.message) ? emptyPage(params.page, params.pageSize) : response;
        }
        return {
          pagination: response.pagination,
          data: (response.data ?? []).map((row) => ({ ...row, locations: row.locations ?? [] })),
        };
      }),
    );
  }

  // One employee's full detail, for the "View" screen off a grid row.
  get(empId: number): Observable<EmployeeDetail | ApiError> {
    return this.withEmployeeDispatchUrl((dispatchUrl) =>
      this.http.post<RawEmployeeDetail | ApiError>(dispatchUrl, { action: '*GET', empId }),
    ).pipe(
      map((response): EmployeeDetail | ApiError => {
        if ('success' in response) {
          return response;
        }
        return { ...response, locationCount: response.locationCount ?? 0 };
      }),
    );
  }

  // Every role for the customer, for the Role filter dropdown — called
  // once; add an "All roles" (`roleId: 0`) option in the template rather
  // than expecting it back from here.
  listRoles(): Observable<EmployeeRole[] | ApiError> {
    return this.http
      .post<{ data: EmployeeRole[] | null } | ApiError>(this.rolesDispatchUrl, { action: '*LIST_ALL' })
      .pipe(
        map((response): EmployeeRole[] | ApiError => {
          if ('success' in response) {
            return isEmptyResultMessage(response.message) ? [] : response;
          }
          return response.data ?? [];
        }),
      );
  }

  private withEmployeeDispatchUrl<T>(request: (dispatchUrl: string) => Observable<T>): Observable<T> {
    return this.tenantSettingsService.load().pipe(
      switchMap((settings) => {
        const program = settings.data_resid === 'CA' ? 'APCTPCEMCA' : 'APCTPCEMP';
        return request(`${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=${program}`);
      }),
    );
  }
}
