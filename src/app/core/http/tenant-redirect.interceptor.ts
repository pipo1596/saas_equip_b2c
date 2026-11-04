import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { NEVER, of, switchMap } from 'rxjs';

// `APCTPSTNGS`'s `*GET` (see `TenantSettingsService.load()`) is the one
// dispatch call every page makes before anything else renders. If this
// tenant's portal has been moved to a different domain entirely, the backend
// answers with a real HTTP 3xx — but this app's `HttpClient` runs on
// `fetch()` (`withFetch()` in app.config.ts), which silently follows a
// genuine redirect before Angular (or `charsetDecodeInterceptor`) ever sees
// the 301 itself. The only trace left behind is the response's own `url` no
// longer matching what was actually requested — that's the one signal this
// can act on, and the only correct response is a real, full-page departure
// from this app, not routing through whatever body the new location
// happened to return.
//
// Registered *after* `charsetDecodeInterceptor` in app.config.ts, which
// places this one closer to the backend — so, in the response direction, it
// runs *first*, on the raw, still-undecoded bytes. That matters: the
// redirect target's body might not even be JSON (a plain landing page,
// most likely), and decoding it first could throw before this ever gets a
// chance to look at `url`.
export const tenantRedirectInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.urlWithParams.includes('SEPGM=APCTPSTNGS')) {
    return next(req);
  }

  const document = inject(DOCUMENT);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  // Resolved against the document the same way a response's own `url` is
  // always absolute (per the Fetch spec) — `req.urlWithParams` itself is
  // ordinarily relative (`environment.apiBaseUrl` is usually ''), so
  // comparing it as-is against `event.url` would read every normal,
  // non-redirected response as a mismatch.
  const requestUrl = new URL(req.urlWithParams, document.baseURI).href;

  return next(req).pipe(
    switchMap((event) => {
      if (!isBrowser || !(event instanceof HttpResponse) || !event.url) {
        return of(event);
      }
      if (new URL(event.url, document.baseURI).href === requestUrl) {
        return of(event);
      }
      document.defaultView?.location.assign(event.url);
      return NEVER;
    }),
  );
};
