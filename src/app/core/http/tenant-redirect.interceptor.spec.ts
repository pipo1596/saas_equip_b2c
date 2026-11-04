import { DOCUMENT } from '@angular/common';
import { HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { tenantRedirectInterceptor } from './tenant-redirect.interceptor';

function run(req: HttpRequest<unknown>, next: HttpHandlerFn) {
  let result: unknown;
  let completed = false;
  TestBed.runInInjectionContext(() => {
    tenantRedirectInterceptor(req, next).subscribe({
      next: (event) => (result = event),
      complete: () => (completed = true),
    });
  });
  return { result, completed };
}

// A real `window.location.assign` can't be spied on or reassigned in jsdom
// (it's a non-configurable, read-only own property) — faking the whole
// `DOCUMENT` the interceptor injects is the only seam actually available.
function fakeDocument(assignSpy: (url: string) => void) {
  return { baseURI: 'http://localhost/', defaultView: { location: { assign: assignSpy } } };
}

describe('tenantRedirectInterceptor', () => {
  it('leaves a request to a different endpoint untouched, regardless of its response url', () => {
    TestBed.configureTestingModule({});
    const req = new HttpRequest('POST', '/cgi/APPSCDSPCH?SEPGM=APCCART', {});
    // Would read as a "redirect" under the tenant-settings check below, but
    // this isn't that endpoint at all — never even inspected.
    const response = new HttpResponse({ body: { ok: true }, url: 'https://elsewhere.example/moved' });

    const { result } = run(req, () => of(response));

    expect(result).toBe(response);
  });

  it('passes through a normal (non-redirected) tenant-settings response unchanged', () => {
    TestBed.configureTestingModule({});
    const req = new HttpRequest('POST', '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS', { action: '*GET' });
    const response = new HttpResponse({ body: { tp_id: 1 }, url: '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS' });

    const { result } = run(req, () => of(response));

    expect(result).toBe(response);
  });

  it("navigates the whole browser away, and never emits, when the response's own url no longer matches what was requested", () => {
    const assignSpy = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: fakeDocument(assignSpy) }] });

    const req = new HttpRequest('POST', '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS', { action: '*GET' });
    const response = new HttpResponse({
      body: '<html>moved</html>',
      url: 'https://new-tenant-domain.example/portal',
    });

    const { result, completed } = run(req, () => of(response));

    expect(assignSpy).toHaveBeenCalledWith('https://new-tenant-domain.example/portal');
    expect(result).toBeUndefined();
    expect(completed).toBe(false);
  });

  it('does nothing on the server, even for a mismatched url — there is no browser to navigate', () => {
    const assignSpy = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: DOCUMENT, useValue: fakeDocument(assignSpy) },
      ],
    });

    const req = new HttpRequest('POST', '/cgi/APPSCDSPCH?SEPGM=APCTPSTNGS', { action: '*GET' });
    const response = new HttpResponse({ body: { tp_id: 1 }, url: 'https://new-tenant-domain.example/portal' });

    const { result } = run(req, () => of(response));

    expect(assignSpy).not.toHaveBeenCalled();
    expect(result).toBe(response);
  });
});
