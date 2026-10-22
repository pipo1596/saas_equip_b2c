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
  // body with one character serialized as a single raw byte — not valid
  // UTF-8 on its own — exactly how the vendor API actually sends it when
  // it declares `charset=ISO-8859-1`.
  function singleByteBody(prefix: string, byte: number, suffix: string): ArrayBuffer {
    const prefixBytes = new TextEncoder().encode(prefix);
    const suffixBytes = new TextEncoder().encode(suffix);
    const bytes = new Uint8Array(prefixBytes.length + 1 + suffixBytes.length);
    bytes.set(prefixBytes, 0);
    bytes[prefixBytes.length] = byte;
    bytes.set(suffixBytes, prefixBytes.length + 1);
    return bytes.buffer;
  }

  it('recovers the real character from a response whose Content-Type names ISO-8859-1, matching the vendor bug exactly', () => {
    let result: { value: string } | undefined;
    http.post<{ value: string }>('/cgi/test', {}).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/cgi/test');
    req.flush(singleByteBody('{"value":"Wesson', 0xae, '"}'), {
      headers: { 'Content-Type': 'text/html; charset=ISO-8859-1' },
    });

    expect(result?.value).toBe('Wesson®');
  });

  it("recovers a windows-1252-only character (a curly apostrophe, byte 0x92) rather than the literal ISO-8859-1 control code some engines produce for it", () => {
    // The real bug this guards against: byte 0x92 is an *undefined control
    // character* (U+0092) under a strict ISO-8859-1 mapping, but a
    // printable right single quotation mark (U+2019) under windows-1252 —
    // what admin tools actually emit, and what the "ISO-8859-1" label is
    // supposed to mean for real-world content per the Encoding Standard.
    let result: { value: string } | undefined;
    http.post<{ value: string }>('/cgi/test', {}).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/cgi/test');
    req.flush(singleByteBody('{"value":"Bates Men', 0x92, 's High Shine Duty Oxford"}'), {
      headers: { 'Content-Type': 'text/html; charset=ISO-8859-1' },
    });

    expect(result?.value).toBe('Bates Men’s High Shine Duty Oxford');
  });

  it('fixes a curly apostrophe the backend mis-serialized as a literal "\\u0092" JSON escape (the original byte value used as a code point), matching the real reported title bug', () => {
    // The backend's own bug, separate from the raw-byte one above: the
    // response text contains the six literal ASCII characters making up
    // the escape "\u0092" (not a raw 0x92 byte) — `JSON.parse` resolves
    // that into the single C1 control character U+0092, which this needs
    // to then recognize and remap to the real U+2019.
    let result: { title: string } | undefined;
    http.post<{ title: string }>('/cgi/test', {}).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/cgi/test');
    req.flush(utf8Bytes('{"title":"Bates Men\\u0092s High Shine Duty Oxford"}'), {
      headers: { 'Content-Type': 'text/html; charset=ISO-8859-1' },
    });

    expect(result?.title).toBe('Bates Men’s High Shine Duty Oxford');
  });

  it('fixes the same mis-serialized escape nested inside an object, not just a top-level field', () => {
    let result: { product: { title: string } } | undefined;
    http.post<{ product: { title: string } }>('/cgi/test', {}).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/cgi/test');
    req.flush(utf8Bytes('{"product":{"title":"It\\u0092s here"}}'), {
      headers: { 'Content-Type': 'text/html; charset=ISO-8859-1' },
    });

    expect(result?.product.title).toBe('It’s here');
  });

  it('leaves a C1 code with no windows-1252 override (0x81) as-is, rather than guessing', () => {
    let result: { value: string } | undefined;
    http.post<{ value: string }>('/cgi/test', {}).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/cgi/test');
    req.flush(utf8Bytes('{"value":"a\\u0081b"}'), { headers: { 'Content-Type': 'application/json' } });

    expect(result?.value).toBe('a\u0081b');
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
