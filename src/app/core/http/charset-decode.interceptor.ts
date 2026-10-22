import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs';

// Decodes every JSON response ourselves, honoring whatever charset the
// response's own `Content-Type` actually declares — instead of trusting
// `fetch()`'s built-in `.json()`/`.text()`, which the WHATWG Fetch spec
// mandates always decode the body as UTF-8, regardless of what the header
// says.
//
// This API's dispatch endpoint sometimes answers with
// `Content-Type: text/html; charset=ISO-8859-1` even though the payload is
// JSON — and, unlike a merely-mislabeled-but-still-UTF-8 body, it actually
// serializes non-ASCII characters as raw ISO-8859-1 bytes to match that
// label (e.g. "®" goes out as the single byte 0xAE). A UTF-8-only decode
// then finds that lone byte invalid on its own (it falls in UTF-8's
// continuation-byte range) and replaces it with U+FFFD before our code
// ever sees the string — a vendor-side bug we can't fix at the source.
// Decoding with the charset the response itself names recovers the
// original character correctly.
export const charsetDecodeInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.responseType !== 'json') {
    return next(req);
  }
  return next(req.clone({ responseType: 'arraybuffer' })).pipe(
    map((event) => {
      if (!(event instanceof HttpResponse) || !(event.body instanceof ArrayBuffer)) {
        return event;
      }
      const charset = extractCharset(event.headers.get('content-type')) ?? 'utf-8';
      const text = new TextDecoder(charset).decode(event.body);
      return event.clone({ body: text.length > 0 ? JSON.parse(text) : null });
    }),
  );
};

function extractCharset(contentType: string | null): string | null {
  const match = contentType?.match(/charset=([^;]+)/i);
  return match ? match[1].trim().toLowerCase() : null;
}
