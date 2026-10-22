import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { charsetDecodeInterceptor } from './charset-decode.interceptor';

describe('charsetDecodeInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([charsetDecodeInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // `TextEncoder` is a Node global, not jsdom's own — its `.encode()` result
  // is backed by Node's own `ArrayBuffer`, which fails `instanceof
  // ArrayBuffer` against jsdom's realm (what `TestRequest.flush` checks
  // against). Re-wrapping through a `Uint8Array` constructed right here
  // copies the bytes into this file's own (jsdom) realm instead.
  function utf8Bytes(text: string): ArrayBuffer {
    return new Uint8Array(new TextEncoder().encode(text)).buffer;
  }

  // Builds the exact real-world broken payload: an otherwise-ASCII JSON
  // body with "®" serialized as the single raw ISO-8859-1 byte (0xAE) —
  // not valid UTF-8 on its own — exactly how the vendor API actually sends
  // it when it declares `charset=ISO-8859-1`.
  function iso88591Body(prefix: string, suffix: string): ArrayBuffer {
    const prefixBytes = new TextEncoder().encode(prefix);
    const suffixBytes = new TextEncoder().encode(suffix);
    const bytes = new Uint8Array(prefixBytes.length + 1 + suffixBytes.length);
    bytes.set(prefixBytes, 0);
    bytes[prefixBytes.length] = 0xae; // Registered sign (®) in ISO-8859-1.
    bytes.set(suffixBytes, prefixBytes.length + 1);
    return bytes.buffer;
  }

  it('recovers the real character from a response whose Content-Type names ISO-8859-1, matching the vendor bug exactly', () => {
    let result: { value: string } | undefined;
    http.post<{ value: string }>('/cgi/test', {}).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/cgi/test');
    req.flush(iso88591Body('{"value":"Wesson', '"}'), {
      headers: { 'Content-Type': 'text/html; charset=ISO-8859-1' },
    });

    expect(result?.value).toBe('Wesson®');
  });

  it('still parses a normal UTF-8 response correctly when no charset is declared', () => {
    let result: { value: string } | undefined;
    http.post<{ value: string }>('/cgi/test', {}).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/cgi/test');
    req.flush(utf8Bytes('{"value":"Wesson®"}'), { headers: { 'Content-Type': 'application/json' } });

    expect(result?.value).toBe('Wesson®');
  });

  it('still parses a normal UTF-8 response correctly when the header explicitly says UTF-8', () => {
    let result: { value: string } | undefined;
    http.post<{ value: string }>('/cgi/test', {}).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/cgi/test');
    req.flush(utf8Bytes('{"value":"café"}'), { headers: { 'Content-Type': 'application/json; charset=UTF-8' } });

    expect(result?.value).toBe('café');
  });

  it('resolves null for an empty body instead of throwing on JSON.parse', () => {
    let result: unknown;
    let errored = false;
    http.post<unknown>('/cgi/test', {}).subscribe({
      next: (res) => (result = res),
      error: () => (errored = true),
    });

    const req = httpMock.expectOne('/cgi/test');
    req.flush(new ArrayBuffer(0), { headers: { 'Content-Type': 'application/json' } });

    expect(errored).toBe(false);
    expect(result).toBeNull();
  });
});
