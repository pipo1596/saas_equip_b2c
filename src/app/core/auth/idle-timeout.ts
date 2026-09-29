import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { Router } from '@angular/router';

import { TenantSettingsService } from '../tenant/tenant-settings';
import { AuthService } from './auth';

// Any of these on `document` counts as "the shopper is still here" — mouse,
// keyboard, and touch input, but deliberately not `mousemove`/`scroll`,
// which fire continuously and would just churn the timer for no reason.
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart'] as const;

// Shared across every tab of the same origin (localStorage, not
// sessionStorage) — activity in one tab counts as activity for the whole
// session, matching how `AuthService` already treats the session itself as
// shared. It's also what makes the timeout survive a page reload (e.g. a
// backgrounded tab the browser discarded to save memory) correctly: the
// countdown resumes from the real last-activity time instead of quietly
// restarting a full `ses_timeout` window.
const LAST_ACTIVITY_STORAGE_KEY = 'idleTimeout.lastActivityAt';

// Logs an idle shopper out after the current tenant's `ses_timeout` (in
// minutes, from `TenantSettings`) has passed with no activity — instantiated
// once from the app root (see `App`) so it's watching for the whole
// session's lifetime, not tied to any one page.
//
// A plain `setTimeout` for the full duration would be enough for a tab that
// stays open and focused the whole time, but it isn't reliable on its own:
// browsers throttle timers in backgrounded tabs (delaying it, generally
// harmless here), and a tab that gets discarded/reloaded, or a laptop that
// sleeps, can make an in-memory timer lose track of how much idle time has
// really passed. Anchoring every check to the persisted last-activity
// timestamp — re-verified whenever the tab becomes visible again, not just
// when its own timer happens to fire — closes that gap.
@Injectable({ providedIn: 'root' })
export class IdleTimeoutService {
  private readonly authService = inject(AuthService);
  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    for (const eventName of ACTIVITY_EVENTS) {
      document.addEventListener(eventName, this.onActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    // Activity recorded in a sibling tab of the same session should count
    // here too, without waiting for this tab's own (possibly much later,
    // throttled) timer to fire and only then notice it should've been
    // rescheduled.
    window.addEventListener('storage', this.onStorage);

    // This service is provided in root and, in the real app, lives for as
    // long as the app itself — but a test creates and tears down a fresh
    // instance (and injector) per spec, and without removing these
    // `document`/`window` listeners on teardown, every earlier test's
    // instance would keep reacting to events dispatched by later ones.
    inject(DestroyRef).onDestroy(() => {
      for (const eventName of ACTIVITY_EVENTS) {
        document.removeEventListener(eventName, this.onActivity);
      }
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('storage', this.onStorage);
      this.clearTimer();
    });

    // Also (re)arms whenever the session starts/ends or the tenant's
    // configured timeout arrives — `ses_timeout` loads asynchronously after
    // login, often after the shopper's very first bit of activity has
    // already passed.
    effect(() => {
      this.authService.session();
      this.tenantSettingsService.settings();
      this.armTimer();
    });
  }

  private readonly onActivity = (): void => {
    this.writeLastActivityAt(Date.now());
    this.armTimer();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.armTimer();
    }
  };

  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key === LAST_ACTIVITY_STORAGE_KEY) {
      this.armTimer();
    }
  };

  // The single source of truth for "how long until logout" — always
  // recomputed from the persisted last-activity time rather than assumed
  // from whatever this tab last scheduled, so every caller (a fresh
  // activity event, the tab regaining visibility, another tab's storage
  // write, or the timer simply reaching its own deadline) ends up re-
  // checking the same real clock instead of trusting elapsed setTimeout
  // time on its own.
  private readonly armTimer = (): void => {
    this.clearTimer();
    const session = this.authService.session();
    const minutes = this.tenantSettingsService.settings()?.ses_timeout;
    if (!session || !minutes || minutes <= 0) {
      if (!session) {
        this.clearLastActivityAt();
      }
      return;
    }

    const lastActivityAt = this.readLastActivityAt() ?? this.writeLastActivityAt(Date.now());
    const remainingMs = minutes * 60_000 - (Date.now() - lastActivityAt);
    if (remainingMs <= 0) {
      this.logoutForInactivity();
      return;
    }
    this.timeoutId = setTimeout(this.armTimer, remainingMs);
  };

  private clearTimer(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private readLastActivityAt(): number | null {
    try {
      const raw = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
      const parsed = raw !== null ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      // Storage can throw (private browsing, quota) — fall back to
      // treating this as fresh activity rather than failing to arm at all.
      return null;
    }
  }

  private writeLastActivityAt(now: number): number {
    try {
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
    } catch {
      // Ignore — the timer still works for this tab from memory, it just
      // won't survive a reload or sync across tabs.
    }
    return now;
  }

  private clearLastActivityAt(): void {
    try {
      localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    } catch {
      // Ignore.
    }
  }

  private logoutForInactivity(): void {
    this.authService.logout();
    // Matches `authGuard`'s own redirect target for an unauthenticated
    // visitor — the login page is mounted at `/`, not `/login`.
    this.router.navigateByUrl('/');
  }
}
