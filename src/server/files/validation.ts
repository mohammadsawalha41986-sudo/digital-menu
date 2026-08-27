/**
 * Upload validation (master spec §54, §55).
 *
 * Three independent checks, because each catches what the others miss:
 *
 *  1. **Declared content type** — cheap, and trivially forged.
 *  2. **Extension** — what the browser and OS will act on when downloaded.
 *  3. **Magic bytes** — what the file actually is.
 *
 * A file passes only when all three agree. That is what stops an executable
 * or an HTML page (which would be a stored-XSS vector when served from our
 * origin) from being published as "menu.pdf".
 */

export class FileValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'FileValidationError';
    this.code = code;
  }
}

export interface AllowedType {
  contentType: string;
  extensions: readonly string[];
  /** Leading bytes the format must start with. */
  magic: readonly (readonly number[])[];
  maxBytes: number;
}

const MEGABYTE = 1024 * 1024;

/**
 * Phase 4 publishes PDFs only (§54). Images are listed as a future addition
 * in the spec; adding one here is the whole change.
 */
export const ALLOWED_PUBLIC_TYPES: readonly AllowedType[] = [
  {
    contentType: 'application/pdf',
    extensions: ['.pdf'],
    // "%PDF-"
    magic: [[0x25, 0x50, 0x44, 0x46, 0x2d]],
    maxBytes: 25 * MEGABYTE,
  },
];

export const ALLOWED_IMAGE_TYPES: readonly AllowedType[] = [
  {
    contentType: 'image/jpeg',
    extensions: ['.jpg', '.jpeg'],
    magic: [[0xff, 0xd8, 0xff]],
    maxBytes: 8 * MEGABYTE,
  },
  {
    contentType: 'image/png',
    extensions: ['.png'],
    magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    maxBytes: 8 * MEGABYTE,
  },
  {
    contentType: 'image/webp',
    extensions: ['.webp'],
    // RIFF....WEBP — the first four bytes; the WEBP tag is checked separately.
    magic: [[0x52, 0x49, 0x46, 0x46]],
    maxBytes: 8 * MEGABYTE,
  },
];

export interface ValidatedUpload {
  contentType: string;
  extension: string;
  sizeBytes: number;
  safeName: string;
}

export interface UploadCandidate {
  fileName: string;
  declaredContentType: string;
  bytes: Uint8Array;
}

export function validateUpload(
  candidate: UploadCandidate,
  allowed: readonly AllowedType[] = ALLOWED_PUBLIC_TYPES,
): ValidatedUpload {
  const extension = extensionOf(candidate.fileName);

  const match = allowed.find(
    (type) =>
      type.contentType === candidate.declaredContentType.split(';')[0]?.trim().toLowerCase(),
  );

  if (!match) {
    throw new FileValidationError(
      'type_not_allowed',
      `Files of type ${candidate.declaredContentType} cannot be published`,
    );
  }

  if (!match.extensions.includes(extension)) {
    // A mismatch here means the name and the declared type disagree, which is
    // either a mistake or an attempt to have the file act as something else.
    throw new FileValidationError(
      'extension_mismatch',
      `A ${match.contentType} file must use ${match.extensions.join(' or ')}`,
    );
  }

  if (candidate.bytes.byteLength === 0) {
    throw new FileValidationError('empty_file', 'The file is empty');
  }

  if (candidate.bytes.byteLength > match.maxBytes) {
    throw new FileValidationError(
      'too_large',
      `File is larger than the ${Math.round(match.maxBytes / MEGABYTE)}MB limit`,
    );
  }

  if (!hasMagic(candidate.bytes, match.magic)) {
    throw new FileValidationError(
      'content_mismatch',
      `The file content is not a valid ${match.contentType}`,
    );
  }

  // WebP declares its real format four bytes in; check it rather than
  // accepting any RIFF container (AVI and WAV are RIFF too).
  if (match.contentType === 'image/webp' && !hasBytesAt(candidate.bytes, 8, [0x57, 0x45, 0x42, 0x50])) {
    throw new FileValidationError('content_mismatch', 'The file is a RIFF container but not WebP');
  }

  return {
    contentType: match.contentType,
    extension,
    sizeBytes: candidate.bytes.byteLength,
    safeName: sanitizeFileName(candidate.fileName),
  };
}

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index === -1 ? '' : fileName.slice(index).toLowerCase();
}

function hasMagic(bytes: Uint8Array, signatures: readonly (readonly number[])[]): boolean {
  return signatures.some((signature) => hasBytesAt(bytes, 0, signature));
}

function hasBytesAt(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (bytes.byteLength < offset + expected.length) return false;
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Reduces a user-supplied filename to something safe to echo in a
 * Content-Disposition header and to keep as metadata. It never becomes part of
 * a storage key — those are generated — so this is defence in depth.
 */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? 'file';

  return (
    base
      .normalize('NFKC')
      // Quotes and semicolons would break out of a Content-Disposition value.
      .replace(/["'\\;\r\n]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'file'
  );
}
