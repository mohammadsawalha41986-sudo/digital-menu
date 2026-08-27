/**
 * Storage abstraction (master spec §56, §131).
 *
 * Domain code depends on this interface only. Swapping the local filesystem
 * for Cloudflare R2 or S3 must not require touching business logic — an
 * implementation is registered once in `./index.ts` and nowhere else.
 */

export interface StoredObject {
  /** Provider-agnostic key, e.g. `businesses/7XK92A/menu-2026-01.pdf`. */
  key: string;
  size: number;
  contentType: string;
  /** Absent for providers that do not expose immutable public URLs. */
  publicUrl?: string;
  lastModified?: Date;
}

export interface PutObjectInput {
  key: string;
  body: Uint8Array | Buffer;
  contentType: string;
  /** Cache-Control to apply where the provider supports it. */
  cacheControl?: string;
}

export interface SignedUrlOptions {
  expiresInSeconds?: number;
}

export interface StorageProvider {
  readonly name: string;

  put(input: PutObjectInput): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array | null>;
  head(key: string): Promise<StoredObject | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;

  /** Stable URL for objects intentionally published to visitors. */
  publicUrl(key: string): string;
  /** Time-limited URL for private objects. */
  signedUrl(key: string, options?: SignedUrlOptions): Promise<string>;
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

/** Control characters (C0 range and DEL) are rejected in storage keys. */
function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Keys are a security boundary: they are interpolated into filesystem paths by
 * the local provider and into object paths by remote ones. Traversal segments,
 * absolute paths, backslashes and control characters are rejected outright
 * (master spec §55).
 */
export function assertSafeKey(key: string): asserts key is string {
  const invalid =
    key.length === 0 ||
    key.length > 512 ||
    key.startsWith('/') ||
    key.includes('\\') ||
    hasControlCharacter(key) ||
    key.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');

  if (invalid) {
    throw new StorageError(`Unsafe storage key: ${JSON.stringify(key)}`);
  }
}
