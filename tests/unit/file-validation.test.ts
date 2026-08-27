import { describe, expect, it } from 'vitest';
import {
  ALLOWED_IMAGE_TYPES,
  FileValidationError,
  sanitizeFileName,
  validateUpload,
} from '@/server/files/validation';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

function bytes(...prefix: number[]): Uint8Array {
  return new Uint8Array([...prefix, ...new Array(64).fill(0x20)]);
}

const validPdf = {
  fileName: 'menu.pdf',
  declaredContentType: 'application/pdf',
  bytes: bytes(...PDF_MAGIC),
};

describe('upload validation', () => {
  it('accepts a real PDF', () => {
    const result = validateUpload(validPdf);
    expect(result.contentType).toBe('application/pdf');
    expect(result.extension).toBe('.pdf');
  });

  it('tolerates a charset parameter on the declared type', () => {
    expect(() =>
      validateUpload({ ...validPdf, declaredContentType: 'application/pdf; charset=binary' }),
    ).not.toThrow();
  });

  it('rejects a file whose content is not what it claims', () => {
    // The classic attack: an HTML page named menu.pdf, which would be a stored
    // XSS if it were ever served from our origin.
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');

    expect(() => validateUpload({ ...validPdf, bytes: html })).toThrow(FileValidationError);
  });

  it('rejects a disallowed type outright', () => {
    for (const contentType of [
      'text/html',
      'image/svg+xml',
      'application/x-msdownload',
      'application/octet-stream',
      'application/javascript',
    ]) {
      expect(
        () => validateUpload({ ...validPdf, declaredContentType: contentType }),
        contentType,
      ).toThrow(FileValidationError);
    }
  });

  it('rejects a name and type that disagree', () => {
    expect(() => validateUpload({ ...validPdf, fileName: 'menu.html' })).toThrow(
      FileValidationError,
    );
    expect(() => validateUpload({ ...validPdf, fileName: 'menu' })).toThrow(FileValidationError);
  });

  it('rejects an empty or oversized file', () => {
    expect(() => validateUpload({ ...validPdf, bytes: new Uint8Array(0) })).toThrow(
      FileValidationError,
    );

    const huge = new Uint8Array(26 * 1024 * 1024);
    huge.set(PDF_MAGIC);
    expect(() => validateUpload({ ...validPdf, bytes: huge })).toThrow(FileValidationError);
  });

  it('checks the WebP tag rather than accepting any RIFF container', () => {
    const riffOnly = bytes(0x52, 0x49, 0x46, 0x46);
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, ...new Array(32).fill(0),
    ]);

    const candidate = { fileName: 'a.webp', declaredContentType: 'image/webp' };

    // An AVI or WAV would pass a naive RIFF check.
    expect(() => validateUpload({ ...candidate, bytes: riffOnly }, ALLOWED_IMAGE_TYPES)).toThrow(
      FileValidationError,
    );
    expect(() => validateUpload({ ...candidate, bytes: webp }, ALLOWED_IMAGE_TYPES)).not.toThrow();
  });

  it('reports a machine-readable code alongside the operator message', () => {
    try {
      validateUpload({ ...validPdf, declaredContentType: 'text/html' });
      expect.unreachable('expected a rejection');
    } catch (error) {
      expect((error as FileValidationError).code).toBe('type_not_allowed');
    }
  });
});

describe('filename sanitisation', () => {
  it('strips path components', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\me\\menu.pdf')).toBe('menu.pdf');
  });

  it('strips characters that would break a Content-Disposition header', () => {
    const sanitised = sanitizeFileName('me"nu;\r\nX-Injected: 1.pdf');

    expect(sanitised).not.toContain('"');
    expect(sanitised).not.toContain(';');
    expect(sanitised).not.toContain('\r');
    expect(sanitised).not.toContain('\n');
  });

  it('never returns an empty name', () => {
    expect(sanitizeFileName('')).toBe('file');
    expect(sanitizeFileName('///')).toBe('file');
  });

  it('bounds the length', () => {
    expect(sanitizeFileName(`${'a'.repeat(400)}.pdf`).length).toBeLessThanOrEqual(120);
  });
});
