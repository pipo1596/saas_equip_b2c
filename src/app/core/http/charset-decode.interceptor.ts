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
// serializes non-ASCII characters as raw single bytes to match that label
// (e.g. "®" goes out as 0xAE, a curly apostrophe as 0x92). A UTF-8-only
// decode then finds those bytes invalid on their own (0xAE falls in UTF-8's
// continuation-byte range) and replaces them with U+FFFD before our code
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
      const charset = normalizeCharset(extractCharset(event.headers.get('content-type')) ?? 'utf-8');
      const text = new TextDecoder(charset).decode(event.body);
      const parsed = text.length > 0 ? JSON.parse(text) : null;
      return event.clone({ body: parsed === null ? null : fixMisencodedC1Controls(parsed) });
    }),
  );
};

function extractCharset(contentType: string | null): string | null {
  const match = contentType?.match(/charset=([^;]+)/i);
  return match ? match[1].trim().toLowerCase() : null;
}

// Every label the WHATWG Encoding Standard says should decode as
// `windows-1252` instead of a strict byte-for-byte ISO-8859-1 mapping —
// bytes 0x80-0x9F are undefined control codes under true Latin-1, but
// windows-1252 (what real-world "ISO-8859-1"-labeled content almost always
// actually is) remaps them to printable characters real admin tools emit
// all the time: curly quotes, en/em dashes, an ellipsis, trademark/
// registered-sign-adjacent symbols, and so on.
//
// Browsers are supposed to apply this same substitution for the
// `TextDecoder` label "iso-8859-1" per the Encoding Standard, but it turns
// out *not every engine actually does* — Node's `TextDecoder` aliases it to
// `windows-1252` correctly, while at least one real browser was observed
// decoding it strictly instead, turning a curly apostrophe's byte (0x92)
// into the literal control character U+0092 (an undefined, invisible/
// missing-glyph code point) rather than U+2019. Rather than depend on
// engine-specific alias tables lining up, this maps the label ourselves so
// the result is identical everywhere.
const ISO_8859_1_LABELS = new Set([
  'iso-8859-1',
  'iso8859-1',
  'iso_8859-1',
  'iso_8859-1:1987',
  'iso-ir-100',
  'latin1',
  'l1',
  'csisolatin1',
  'ibm819',
  'cp819',
  '8859-1',
  '88591',
]);

function normalizeCharset(charset: string): string {
  return ISO_8859_1_LABELS.has(charset) ? 'windows-1252' : charset;
}

// windows-1252's own overrides for bytes 0x80-0x9F — curly quotes, en/em
// dashes, an ellipsis, trademark, etc. — the same single-byte layout
// `normalizeCharset`'s substitution already recovers for a *raw* byte in
// the response body. Keyed by that original byte value. A byte windows-1252
// itself leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D) has no entry.
const WINDOWS_1252_C1_OVERRIDES: Readonly<Record<number, string>> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
};

// A second, independent bug this backend's JSON serialization has on top
// of the raw-byte one `normalizeCharset` already corrects: for *some*
// characters, instead of emitting the raw byte (or a correctly-computed
// `\uXXXX` escape), it writes a JSON unicode escape using the original
// single byte's own numeric value as if that were already the right
// Unicode code point — e.g. a curly apostrophe (really windows-1252 byte
// 0x92, U+2019) comes out as the literal escape "\u0092" instead of
// "’". Fixing this has to happen *after* `JSON.parse`, not before:
// the raw response text still has six literal ASCII characters ("\", "u",
// "0", "0", "9", "2") at that point — only `JSON.parse`'s own escape
// handling turns it into the one C1 control character. Once it has, that
// code point (U+0080-U+009F) should never legitimately appear in real
// text, making it a reliable signal to remap through the same table above.
function fixMisencodedC1Controls<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/[\u0080-\u009f]/g, (char) => WINDOWS_1252_C1_OVERRIDES[char.charCodeAt(0)] ?? char) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => fixMisencodedC1Controls(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const fixed: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      fixed[key] = fixMisencodedC1Controls(entry);
    }
    return fixed as T;
  }
  return value;
}
