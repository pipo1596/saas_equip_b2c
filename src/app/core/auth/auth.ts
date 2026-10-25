import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { type Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CartService } from '../cart/cart';
import { EmployeeService, type EmployeeLocation, type Impersonation } from '../employee/employee';

export type { EmployeeLocation, Impersonation } from '../employee/employee';

// The legacy CGI dispatcher branches on this `action` field rather than the
// URL/SEPGM value. `login` and `verifyMfa` are confirmed against the real
// API; the reset actions are not yet confirmed — update those once the
// real contract for forgot/reset password is known.
const ACTION = {
  login: 'LOGIN1',
  verifyMfa: 'MFA1',
  requestReset: 'FORGOT1',
  resetPassword: 'RESET1',
  shopAs: 'SHOPAS1',
  shopEnd: 'SHOPEND',
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

// Validates/normalizes a raw `AUTH_STORAGE_KEY` JSON string into a `Session`
// — shared by this tab's own initial read (`restoreSession`) and by
// reacting to a *different* tab's write of the same key (`onStorage`
// below). Pure: never touches storage itself either way, so it's safe to
// call against a value this tab doesn't own.
function parseStoredSession(raw: string): Session | null {
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    // A session cached before a field (e.g. `locations`, `email`/`phone`)
    // was added to the Session shape would otherwise silently restore
    // without it — treat it as absent so the user logs in again and gets
    // the full payload.
    if (
      !parsed.empId ||
      !parsed.sessionId ||
      !Array.isArray(parsed.locations) ||
      typeof parsed.email !== 'string' ||
      typeof parsed.phone !== 'string'
    ) {
      return null;
    }
    // Unlike the required fields above, a session cached before
    // `impersonation` existed just means "not impersonating" — there's no
    // reason to treat it as absent over it.
    return { ...parsed, impersonation: parsed.impersonation ?? null } as Session;
  } catch {
    return null;
  }
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
  email?: string;
  phone?: string;
  message: string | null;
}

export interface SimpleResponse {
  success: boolean;
  message: string | null;
}

// The `SHOPAS1` response — same dispatcher/session pattern as `LOGIN1`, but
// never requires MFA (the admin already authenticated in the admin
// console) and carries who's actually doing the shopping.
export interface ShopAsResponse {
  success: boolean;
  empId?: string;
  source?: 'L' | 'R';
  sessionId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  actorName?: string;
  actorLevel?: 'L1' | 'L2';
  message: string | null;
}

export interface ShopEndResponse {
  success: boolean;
  wasImpersonating: boolean;
  message: string | null;
}

export interface Session {
  empId: string;
  sessionId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  locations: EmployeeLocation[];
  impersonation: Impersonation | null;
}

interface PendingMfa {
  empId: string;
  sessionId: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly employeeService = inject(EmployeeService);
  private readonly cartService = inject(CartService);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly dispatchUrl = `${environment.apiBaseUrl}/cgi/APPSCDSPCH?SEPGM=APCLOGIN`;

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    // A *different* employee's session landing in another tab (a fresh
    // login there, or — the case this is for — a shop-as redemption) means
    // this tab's own in-memory identity is now stale and potentially the
    // wrong person's data. `storage` only ever fires in a sibling tab, never
    // the one that made the write, so there's no risk of a tab reacting to
    // its own change.
    window.addEventListener('storage', this.onStorage);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', this.onStorage));
  }

  readonly session = signal<Session | null>(this.restoreSession());
  readonly pendingMfa = signal<PendingMfa | null>(this.restorePendingMfa());
  // Set once `endSession()` resolves with `wasImpersonating: true` — tells
  // `app.html` to replace the whole routed app with a static "session
  // ended" screen instead of sending the admin to the portal login page.
  readonly sessionEnded = signal(false);

  // Only `pendingMfa` (empId/sessionId) survives a refresh, in
  // sessionStorage — the password itself is kept in memory only, for as
  // long as this tab's challenge is in progress, so a resend can replay
  // `login` (the call that actually sends the code) without asking the
  // employee to type their password again. It never reaches
  // localStorage/sessionStorage, and is cleared the moment the challenge
  // resolves (or the employee cancels), so it doesn't linger once it's no
  // longer needed. Lost on refresh, same as any other in-memory state —
  // resend after a refresh falls back to asking the employee to sign in
  // again instead.
  private pendingCredentials: { email: string; password: string } | null = null;

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
  readonly impersonation = computed(() => this.session()?.impersonation ?? null);

  login(email: string, password: string): Observable<LoginResponse> {
    this.pendingCredentials = { email, password };
    return this.http
      .post<LoginResponse>(this.dispatchUrl, { email, password, action: ACTION.login })
      .pipe(tap((response) => this.applyLoginResponse(response)));
  }

  // Replays `login` with the same credentials — there's no dedicated resend
  // action, and `login` (LOGIN1) is what actually sends the code in the
  // first place. `null` when the credentials aren't held anymore (e.g. the
  // tab was refreshed mid-challenge) — the caller needs to send the
  // employee back to sign in again rather than attempt a resend.
  resendMfa(): Observable<LoginResponse> | null {
    const pending = this.pendingCredentials;
    return pending ? this.login(pending.email, pending.password) : null;
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
    this.clearLocalState();
  }

  // The real `SHOPAS1` redeem — same dispatcher/session pattern as `login`,
  // but there's no MFA step (the admin already authenticated in the admin
  // console) and the resulting session is flagged as impersonating. Follows
  // the exact same "build session, persist, then refresh from the employee
  // record" path as a normal login (see `applyLoginResponse`) so the
  // `impersonation` flag — merged in from `APCEMPLYEE` by
  // `loadEmployeeDetails` — survives a page reload via the ordinary
  // persisted-session mechanism, with no separate refetch-on-bootstrap
  // needed.
  redeemShopAs(token: string): Observable<ShopAsResponse> {
    return this.http.post<ShopAsResponse>(this.dispatchUrl, { action: ACTION.shopAs, token }).pipe(
      tap((response) => {
        if (!response.success) {
          return;
        }
        const session: Session = {
          empId: response.empId ?? '',
          sessionId: response.sessionId ?? '',
          firstName: response.firstName ?? '',
          lastName: response.lastName ?? '',
          email: response.email ?? '',
          phone: '',
          locations: [],
          impersonation: { active: true, actorName: response.actorName ?? '', actorLevel: response.actorLevel ?? 'L1' },
        };
        this.session.set(session);
        this.persistSession(session);
        this.loadEmployeeDetails(session);
      }),
    );
  }

  // The real sign-out call — ends the banner's "End" button and (per the
  // backend contract) is now also what a normal "Log off" uses, so an
  // ordinary session actually gets invalidated server-side rather than just
  // cleared client-side. `mfa.ts`'s "cancel this challenge" and the idle
  // timeout both keep using the plain, no-network `logout()` above — there's
  // no real session yet in the first case, and no reason to add a network
  // call to the second.
  endSession(): Observable<ShopEndResponse> {
    return this.http.post<ShopEndResponse>(this.dispatchUrl, { action: ACTION.shopEnd }).pipe(
      tap((response) => {
        this.clearLocalState();
        if (response.wasImpersonating) {
          this.sessionEnded.set(true);
        }
      }),
    );
  }

  // Reacts to a *different* employee's session landing in `AUTH_STORAGE_KEY`
  // from another tab — resets this tab's own reactive state and sends it
  // back to the login page. Deliberately uses `resetReactiveState()` rather
  // than `clearLocalState()`: localStorage already correctly holds the
  // other tab's new session, and removing it here (as a full sign-out would)
  // would sign that tab back out too. Same identity (or still nobody, on
  // both sides) is a no-op — most writes to this key are just this same tab
  // persisting its own session, which never reaches here since `storage`
  // doesn't fire in the tab that made the write.
  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key !== AUTH_STORAGE_KEY) {
      return;
    }
    const incomingEmpId = event.newValue ? (parseStoredSession(event.newValue)?.empId ?? null) : null;
    if (incomingEmpId === (this.session()?.empId ?? null)) {
      return;
    }
    this.resetReactiveState();
    this.router.navigateByUrl('/');
  };

  private resetReactiveState(): void {
    this.session.set(null);
    this.pendingMfa.set(null);
    this.pendingCredentials = null;
    this.employeeService.clear();
    this.cartService.reset();
    this.clearPendingMfa();
  }

  private clearLocalState(): void {
    this.resetReactiveState();
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
      email: response.email ?? '',
      phone: response.phone ?? '',
      locations: [],
      impersonation: null,
    };
    this.pendingMfa.set(null);
    this.pendingCredentials = null;
    this.clearPendingMfa();
    this.session.set(session);
    this.persistSession(session);
    this.loadEmployeeDetails(session);
  }

  // The login/MFA response's name/contact fields are a stopgap, and it
  // doesn't carry locations at all — the employee record is the source of
  // truth for all of it.
  //
  // `impersonation` is the one field this *doesn't* just take from
  // `employee` outright — `*GET` doesn't reliably echo it back right after
  // a fresh `redeemShopAs()` (seen live: the banner flashes in from the
  // SHOPAS1 response, then disappears the moment this merge lands with a
  // blank `impersonation`). Since nothing else in this merge is meant to be
  // able to *end* an impersonation anyway (that's `endSession()`'s job
  // alone), falling back to whatever the session already had is strictly
  // safer than trusting `*GET` to carry it.
  private loadEmployeeDetails(session: Session): void {
    this.employeeService.load(session.empId, session.sessionId).subscribe((employee) => {
      const updated: Session = {
        ...session,
        firstName: employee.firstName || session.firstName,
        lastName: employee.lastName || session.lastName,
        email: employee.profile?.personal.email || session.email,
        phone: employee.profile?.personal.phone || session.phone,
        locations: employee.locations ?? session.locations,
        impersonation: employee.impersonation ?? session.impersonation,
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
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const session = parseStoredSession(raw);
    if (!session) {
      // Cached before a field in the current `Session` shape existed, or
      // otherwise malformed — discard it so the user logs in again and gets
      // the full payload, rather than silently restoring a partial session.
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    return session;
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
