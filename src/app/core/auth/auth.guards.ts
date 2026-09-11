import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth';

/** SSR has no persisted session yet; let the client re-check post-hydration
 *  instead of bouncing every server-rendered page one way or the other. */
function isBrowser(): boolean {
  return isPlatformBrowser(inject(PLATFORM_ID));
}

export const authGuard: CanActivateFn = () => {
  if (!isBrowser()) {
    return true;
  }
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? true : inject(Router).parseUrl('/');
};

export const guestGuard: CanActivateFn = () => {
  if (!isBrowser()) {
    return true;
  }
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).parseUrl('/home') : true;
};

export const mfaPendingGuard: CanActivateFn = () => {
  if (!isBrowser()) {
    return true;
  }
  const auth = inject(AuthService);
  return auth.mfaPending() ? true : inject(Router).parseUrl('/');
};
