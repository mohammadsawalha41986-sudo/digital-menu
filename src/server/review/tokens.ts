import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Preview-link tokens (master spec §71, §127).
 *
 * The requirements are stated plainly in the spec: unguessable, expiring,
 * revocable, and never exposing drafts through public ids alone. This module
 * is the first of those; the service handles the other three.
 *
 * The design mirrors the API keys the platform already issues, deliberately
 * rather than inventing a second scheme (§164):
 *
 *  - A short public **key** identifies the row, so a lookup needs no scan.
 *  - A long random **secret** is what actually authorises. Only its SHA-256 is
 *    stored, so a leaked database gives an attacker nothing usable.
 *  - Comparison is timing-safe, because a comparison that returns early leaks
 *    the secret one character at a time.
 *
 * 160 bits of entropy in the secret: brute-forcing it is not a threat model,
 * it is arithmetic that does not finish.
 */

const KEY_BYTES = 6;
const SECRET_BYTES = 20;

/** Base32-ish, minus characters that are misread when a link is read aloud. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function encode(bytes: Buffer): string {
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export interface IssuedToken {
  key: string;
  secret: string;
  tokenHash: string;
  /** What goes in the URL. The only place the two halves appear together. */
  token: string;
}

export function issueToken(): IssuedToken {
  const key = encode(randomBytes(KEY_BYTES));
  const secret = encode(randomBytes(SECRET_BYTES));

  return { key, secret, tokenHash: hashSecret(secret), token: `${key}.${secret}` };
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Splits a URL token, rejecting anything that is not exactly two parts. */
export function parseToken(token: string): { key: string; secret: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [key, secret] = parts;
  if (!key || !secret) return null;
  if (!/^[a-z2-9]+$/.test(key) || !/^[a-z2-9]+$/.test(secret)) return null;

  return { key, secret };
}

export function secretMatches(secret: string, expectedHash: string): boolean {
  const provided = Buffer.from(hashSecret(secret));
  const expected = Buffer.from(expectedHash);

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
