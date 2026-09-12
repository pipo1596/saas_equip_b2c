import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { type Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';

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
}

interface PendingMfa {
  empId: string;
  sessionId: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCLOGIN`;

  readonly session = signal<Session | null>(this.restoreSession());
  readonly pendingMfa = signal<PendingMfa | null>(null);

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly mfaPending = computed(() => this.pendingMfa() !== null);

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
    if (this.isBrowser) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  private applyLoginResponse(response: LoginResponse): void {
    if (!response.success) {
      return;
    }

    if (response.mfaRequired) {
      this.pendingMfa.set({
        empId: response.empId ?? '',
        sessionId: response.sessionId ?? '',
      });
      return;
    }

    const session: Session = {
      empId: response.empId ?? '',
      sessionId: response.sessionId ?? '',
      firstName: response.firstName ?? '',
      lastName: response.lastName ?? '',
    };
    this.pendingMfa.set(null);
    this.session.set(session);
    this.persistSession(session);
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
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }
}
