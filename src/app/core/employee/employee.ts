import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, shareReplay, tap } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface EmployeeLocation {
  empLocId: number;
  locationId: number;
  locationCode: string;
  locationName: string;
}

// Field names beyond empId/firstName/lastName/locations are best guesses
// following the login response's naming convention — confirm/adjust once
// more of the real APCEMPLYEE payload is known.
export interface EmployeeDetails {
  empId: string;
  firstName: string;
  lastName: string;
  locations: EmployeeLocation[];
  email?: string;
  phone?: string;
  jobTitle?: string;
  department?: string;
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
        .post<EmployeeDetails>(this.dispatchUrl, { empId, sessionId, action: '*GET' })
        .pipe(
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
