import { describe, expect, it } from 'vitest';
import { FileValidationError } from '@/server/files/validation';
import { externalStorageKey, parseImageUrl, resolveMediaUrl } from '@/server/media/url';

describe('image URLs', () => {
  it('accepts an ordinary https image address', () => {
    const parsed = parseImageUrl('https://cdn.example.com/dishes/hummus.jpg');

    expect(parsed.url).toBe('https://cdn.example.com/dishes/hummus.jpg');
    expect(parsed.contentType).toBe('image/jpeg');
    expect(parsed.storageKey.startsWith('external/')).toBe(true);
  });

  it('accepts http, and trims surrounding whitespace from a paste', () => {
    expect(parseImageUrl('  http://example.com/a.png  ').url).toBe('http://example.com/a.png');
  });

  it('refuses every scheme that is not http(s)', () => {
    // The reason this list is explicit: a `javascript:` or `data:` value
    // reaching an `img` src or a template is the whole risk of accepting a URL
    // from an operator, and "starts with http" is not the same check as
    // "parses to an http URL".
    for (const hostile of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'file:///etc/passwd',
      'ftp://example.com/a.png',
      'vbscript:msgbox(1)',
    ]) {
      expect(() => parseImageUrl(hostile), hostile).toThrow(FileValidationError);
    }
  });

  it('refuses a URL carrying credentials', () => {
    expect(() => parseImageUrl('https://user:secret@example.com/a.png')).toThrow(
      FileValidationError,
    );
  });

  it('refuses something that is not a URL at all', () => {
    for (const value of ['', '   ', 'not a url', '/relative/path.png', 'example.com/a.png']) {
      expect(() => parseImageUrl(value), JSON.stringify(value)).toThrow(FileValidationError);
    }
  });

  it('refuses an absurdly long URL rather than storing it', () => {
    expect(() => parseImageUrl(`https://example.com/${'a'.repeat(2100)}.png`)).toThrow(
      FileValidationError,
    );
  });

  it('guesses a content type from the extension, and shrugs when there is none', () => {
    expect(parseImageUrl('https://e.com/a.png').contentType).toBe('image/png');
    expect(parseImageUrl('https://e.com/a.WEBP').contentType).toBe('image/webp');
    // CDN URLs frequently carry no extension; the browser decides, and this
    // value is never used to serve anything.
    expect(parseImageUrl('https://e.com/image/abc123').contentType).toBe('image/*');
  });

  it('derives the same key for the same URL, so a repeat add is not a copy', () => {
    const a = parseImageUrl('https://cdn.example.com/x.jpg');
    const b = parseImageUrl('  https://cdn.example.com/x.jpg ');

    expect(a.storageKey).toBe(b.storageKey);
    expect(a.storageKey).toBe(externalStorageKey('https://cdn.example.com/x.jpg'));
    expect(parseImageUrl('https://cdn.example.com/y.jpg').storageKey).not.toBe(a.storageKey);
  });
});

describe('resolving a medium to a public URL', () => {
  const fromStorage = (key: string) => `/uploads/${key}`;

  it('uses the external address when there is one', () => {
    expect(
      resolveMediaUrl({ sourceUrl: 'https://cdn.example.com/a.jpg', storageKey: 'external/abc' }, fromStorage),
    ).toBe('https://cdn.example.com/a.jpg');
  });

  it('falls back to storage for an uploaded file', () => {
    expect(resolveMediaUrl({ sourceUrl: null, storageKey: 'businesses/X/a.jpg' }, fromStorage)).toBe(
      '/uploads/businesses/X/a.jpg',
    );
    // A row selected without the column behaves as an upload rather than throwing.
    expect(resolveMediaUrl({ storageKey: 'businesses/X/a.jpg' }, fromStorage)).toBe(
      '/uploads/businesses/X/a.jpg',
    );
  });
});
