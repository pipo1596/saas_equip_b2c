import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { type Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { EmployeeService, type EmployeeLocation } from '../employee/employee';

export type { EmployeeLocation } from '../employee/employee';

// The legacy CGI dispatcher branches on this `action` field rather than the
// URL/SEPGM value. `login` and `verifyMfa` are confirmed against the real
// API; the reset actions are not yet confirmed — update those once the
// real contract for forgot/reset password is known.
const ACTION = {
  login: 'LOGIN1',
  verifyMfa: 'MFA1',
  requestReset: 'FORGOT1',
  resetPassword: 'RESET1',
} as const;

// localStorage (not sessionStorage) — a session started in one tab should
// already be logged in when the same origin is opened in a new tab.
const AUTH_STORAGE_KEY = 'auth.session';

// sessionStorage (not localStorage) — unlike a completed session, an
// in-progress MFA challenge is specific to the tab that started it and
// shouldn't resurface days later in a new tab; it only needs to survive a
// refresh of the same tab while the user is entering their code.
const PENDING_MFA_STORAGE_KEY = 'auth.pendingMfa';

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

export interface LoginResponse {
  success: boolean;
  // Only present when `success` is true — a failed attempt returns just
  // `{ success: false, message }`.
  mfaRequired?: boolean;
  empId?: string;
  sessionId?: string;
  firstName?: string;
  lastName?: string;
  message: string | null;
}

export interface SimpleResponse {
  success: boolean;
  message: string | null;
}

export interface Session {
  empId: string;
  sessionId: string;
  firstName: string;
  lastName: string;
  locations: EmployeeLocation[];
}

interface PendingMfa {
  empId: string;
  sessionId: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly employeeService = inject(EmployeeService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCLOGIN`;

  readonly session = signal<Session | null>(this.restoreSession());
  readonly pendingMfa = signal<PendingMfa | null>(this.restorePendingMfa());

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly mfaPending = computed(() => this.pendingMfa() !== null);

  private readonly name = computed(() => {
    const session = this.session();
    return {
      first: capitalize(session?.firstName ?? ''),
      last: capitalize(session?.lastName ?? ''),
    };
  });
  readonly firstName = computed(() => this.name().first || null);
  readonly fullName = computed(() => `${this.name().first} ${this.name().last}`.trim() || null);
  readonly initials = computed(() => {
    const { first, last } = this.name();
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || null;
  });
  readonly locations = computed(() => this.session()?.locations ?? []);

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(this.dispatchUrl, { email, password, action: ACTION.login })
      .pipe(tap((response) => this.applyLoginResponse(response)));
  }

  verifyMfa(code: string): Observable<LoginResponse> {
    const pending = this.pendingMfa();
    return this.http
      .post<LoginResponse>(this.dispatchUrl, {
        empId: pending?.empId,
        sessionId: pending?.sessionId,
        code,
        action: ACTION.verifyMfa,
      })
      .pipe(tap((response) => this.applyLoginResponse(response)));
  }

  requestPasswordReset(email: string): Observable<SimpleResponse> {
    return this.http.post<SimpleResponse>(this.dispatchUrl, {
      email,
      action: ACTION.requestReset,
    });
  }

  resetPassword(email: string, code: string, newPassword: string): Observable<SimpleResponse> {
    return this.http.post<SimpleResponse>(this.dispatchUrl, {
      email,
      code,
      newPassword,
      action: ACTION.resetPassword,
    });
  }

  logout(): void {
    this.session.set(null);
    this.pendingMfa.set(null);
    this.employeeService.clear();
    this.clearPendingMfa();
    if (this.isBrowser) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  private applyLoginResponse(response: LoginResponse): void {
    if (!response.success) {
      return;
    }

    if (response.mfaRequired) {
      const pending: PendingMfa = {
        empId: response.empId ?? '',
        sessionId: response.sessionId ?? '',
      };
      this.pendingMfa.set(pending);
      this.persistPendingMfa(pending);
      return;
    }

    // A successful MFA1 verification doesn't necessarily repeat the
    // empId/sessionId the server already correlated via the code exchange
    // — when it doesn't, fall back to the values from the pending
    // challenge (the original LOGIN1 response) instead of persisting a
    // session with blank identifiers. `restoreSession()` rejects a blank
    // empId/sessionId on the next page load, so without this a session
    // that "worked" for the rest of this tab's lifetime would silently log
    // the user back out on refresh.
    const pending = this.pendingMfa();
    const session: Session = {
      empId: response.empId || pending?.empId || '',
      sessionId: response.sessionId || pending?.sessionId || '',
      firstName: response.firstName ?? '',
      lastName: response.lastName ?? '',
      locations: [],
    };
    this.pendingMfa.set(null);
    this.clearPendingMfa();
    this.session.set(session);
    this.persistSession(session);
    this.loadEmployeeDetails(session);
  }

  // The login/MFA response's name fields are a stopgap, and it doesn't carry
  // locations at all — the employee record is the source of truth for both.
  private loadEmployeeDetails(session: Session): void {
    this.employeeService.load(session.empId, session.sessionId).subscribe((employee) => {
      const updated: Session = {
        ...session,
        firstName: employee.firstName || session.firstName,
        lastName: employee.lastName || session.lastName,
        locations: employee.locations ?? session.locations,
      };
      this.session.set(updated);
      this.persistSession(updated);
    });
  }

  private persistSession(session: Session): void {
    if (!this.isBrowser) {
      return;
    }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  }

  private restoreSession(): Session | null {
    if (!this.isBrowser) {
      return null;
    }
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<Session>;
      // A session cached before a field (e.g. `locations`) was added to the
      // Session shape would otherwise silently restore without it — discard
      // it instead so the user logs in again and gets the full payload.
      if (!parsed.empId || !parsed.sessionId || !Array.isArray(parsed.locations)) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
      }
      return parsed as Session;
    } catch {
      return null;
    }
  }

  private persistPendingMfa(pending: PendingMfa): void {
    if (!this.isBrowser) {
      return;
    }
    sessionStorage.setItem(PENDING_MFA_STORAGE_KEY, JSON.stringify(pending));
  }

  private clearPendingMfa(): void {
    if (!this.isBrowser) {
      return;
    }
    sessionStorage.removeItem(PENDING_MFA_STORAGE_KEY);
  }

  private restorePendingMfa(): PendingMfa | null {
    if (!this.isBrowser) {
      return null;
    }
    try {
      const raw = sessionStorage.getItem(PENDING_MFA_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<PendingMfa>;
      if (!parsed.empId || !parsed.sessionId) {
        sessionStorage.removeItem(PENDING_MFA_STORAGE_KEY);
        return null;
      }
      return parsed as PendingMfa;
    } catch {
      return null;
    }
  }
}
