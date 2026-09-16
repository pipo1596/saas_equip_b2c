import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';

import { AuthService } from './auth';
import { authGuard, guestGuard, mfaPendingGuard } from './auth.guards';

describe('auth guards', () => {
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    router = TestBed.inject(Router);
  });

  afterEach(() => localStorage.clear());

  describe('authGuard', () => {
    it('redirects to / when there is no session', () => {
      const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/');
    });

    it('allows navigation once a session exists', () => {
      const auth = TestBed.inject(AuthService);
      auth.session.set({ empId: '1', sessionId: 's', firstName: 'P', lastName: 'A', locations: [] });
      const result = TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
      expect(result).toBe(true);
    });
  });

  describe('guestGuard', () => {
    it('allows navigation when logged out', () => {
      const result = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
      expect(result).toBe(true);
    });

    it('redirects an already-authenticated user to /home', () => {
      const auth = TestBed.inject(AuthService);
      auth.session.set({ empId: '1', sessionId: 's', firstName: 'P', lastName: 'A', locations: [] });
      const result = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/home');
    });
  });

  describe('mfaPendingGuard', () => {
    it('redirects to / when no MFA verification is pending', () => {
      const result = TestBed.runInInjectionContext(() =>
        mfaPendingGuard({} as never, {} as never),
      );
      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/');
    });

    it('allows navigation while MFA verification is pending', () => {
      const auth = TestBed.inject(AuthService);
      auth.pendingMfa.set({ empId: '1', sessionId: 's' });
      const result = TestBed.runInInjectionContext(() =>
        mfaPendingGuard({} as never, {} as never),
      );
      expect(result).toBe(true);
    });
  });
});
