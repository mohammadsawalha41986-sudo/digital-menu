import { createHash } from 'node:crypto';
import { FileValidationError } from '@/server/files/validation';

/**
 * Images referenced by URL rather than uploaded.
 *
 * Most restaurants already have their photography somewhere — a CDN, a
 * designer's bucket, the site the menu is replacing — and asking them to
 * re-upload it is friction for no gain. An image added this way stores no
 * bytes: the URL *is* the public URL, and the visitor's browser loads it from
 * its own origin.
 *
 * That decision is the whole security surface, so it is narrow on purpose.
 * Nothing here fetches the URL server-side: a server that follows an
 * attacker-supplied address is an SSRF, and the browser can tell us whether an
 * image loads far more cheaply than we can. What the server does instead is
 * refuse anything that is not plainly an http(s) address, so no `javascript:`,
 * `data:`, `file:` or credential-bearing URL ever reaches an `img` tag or a
 * template.
 */

/** Scheme allowlist. Everything else is refused, rather than sanitised. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export interface ParsedImageUrl {
  /** The normalised absolute URL to store and render. */
  url: string;
  /** Deterministic key, so the same URL added twice is the same row. */
  storageKey: string;
  /** Content type guessed from the extension; only ever used for display. */
  contentType: string;
}

/**
 * Validates and normalises an image URL.
 *
 * Throws {@link FileValidationError} — the same error the upload path throws —
 * so the action layer reports both in one place and neither can leak an
 * unhandled exception into a 500.
 */
export function parseImageUrl(raw: string): ParsedImageUrl {
  const trimmed = raw.trim();

  if (!trimmed) throw new FileValidationError('url_missing', 'Enter an image URL');
  if (trimmed.length > 2048) throw new FileValidationError('url_too_long', 'That URL is too long');

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new FileValidationError('url_malformed', 'That is not a valid URL');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    // Naming the accepted schemes rather than the rejected one: a `javascript:`
    // URL here is far more likely to be a paste accident than an attack, and
    // the useful message is the same either way.
    throw new FileValidationError('url_scheme', 'The URL must start with http:// or https://');
  }

  if (parsed.username || parsed.password) {
    throw new FileValidationError('url_credentials', 'The URL must not contain a username or password');
  }

  if (!parsed.hostname) throw new FileValidationError('url_no_host', 'That URL has no host');

  const url = parsed.toString();

  return {
    url,
    storageKey: externalStorageKey(url),
    contentType: contentTypeFor(parsed.pathname),
  };
}

/**
 * The synthetic storage key for an external image.
 *
 * `storageKey` is unique, so deriving it from the URL means the database
 * enforces "the same URL is the same image" without a second lookup racing it.
 */
export function externalStorageKey(url: string): string {
  return `external/${createHash('sha256').update(url).digest('hex')}`;
}

/** Best-effort type from the extension. Display only — nothing is served from it. */
function contentTypeFor(pathname: string): string {
  const extension = pathname.slice(pathname.lastIndexOf('.') + 1).toLowerCase();

  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      // A CDN URL often carries no extension at all. The browser decides from
      // the response, and this value is never used to serve anything.
      return 'image/*';
  }
}

/**
 * The public URL for a medium, wherever its bytes live.
 *
 * The one place that decision is made. Both the public renderer and the admin
 * library call this, so an externally-hosted image can never render correctly
 * in one and as a broken storage path in the other.
 */
export function resolveMediaUrl(
  media: { sourceUrl?: string | null; storageKey: string },
  publicUrlForKey: (key: string) => string,
): string {
  return media.sourceUrl ?? publicUrlForKey(media.storageKey);
}
