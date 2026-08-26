import { randomInt } from 'node:crypto';

/**
 * Public identifiers for the permanent-QR architecture (master spec §10, §122).
 *
 * Requirements this satisfies:
 *  - Opaque: reveals nothing about row count or creation order, unlike a
 *    sequential database id. A public URL is `/m/7XK92A`, never `/m/18473`.
 *  - Stable: generated once per business and never rotated, because printed QR
 *    codes encode it.
 *  - Legible: Crockford-style base32 with I, L, O and U removed, so a human
 *    reading a code off a printed card cannot confuse 0/O or 1/I.
 */

/** Crockford base32 minus the ambiguous letters. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PUBLIC_ID_LENGTH = 6;
const PUBLIC_ID_PATTERN = new RegExp(`^[${ALPHABET}]{${PUBLIC_ID_LENGTH}}$`);

/** Characters a human might type in place of the ones we excluded. */
const CONFUSABLES: Record<string, string> = { I: '1', L: '1', O: '0', U: 'V' };

export function generatePublicId(length: number = PUBLIC_ID_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/**
 * Normalizes user/scanner input: uppercases and repairs confusable characters.
 * Does not validate — call {@link isValidPublicId} on the result.
 */
export function normalizePublicId(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[ILOU]/g, (char) => CONFUSABLES[char] ?? char);
}

export function isValidPublicId(input: string): boolean {
  return PUBLIC_ID_PATTERN.test(input);
}

/**
 * Gatekeeper used by the public route before any database call: a malformed
 * identifier is rejected in the application layer rather than being handed to
 * the data layer (master spec §127).
 */
export function parsePublicId(input: string): string | null {
  const normalized = normalizePublicId(input);
  return isValidPublicId(normalized) ? normalized : null;
}
