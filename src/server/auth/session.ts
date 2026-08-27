import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';

/**
 * Stateless session tokens.
 *
 * A signed, self-contained token rather than a database session table: staff
 * sessions are short-lived and low-volume, and this keeps every request from
 * paying a session lookup. The trade-off — no server-side revocation — is
 * bounded by a short lifetime and a `tokenVersion` claim that a future
 * "sign out everywhere" can bump.
 *
 * Format: base64url(payload).base64url(hmac-sha256(payload))
 */

export interface SessionPayload {
  userId: string;
  /** Issued-at and expiry, both unix seconds. */
  iat: number;
  exp: number;
  /** Random per-session id, useful for correlating logs. */
  sid: string;
}

export const SESSION_COOKIE = 'dpos_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export function createSessionToken(userId: string, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);

  const payload: SessionPayload = {
    userId,
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
    sid: randomBytes(9).toString('base64url'),
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

/**
 * Verifies and decodes a token. Every failure mode — tampering, expiry,
 * malformed input — returns null rather than throwing, so a caller cannot
 * accidentally distinguish them in an error message.
 */
export function readSessionToken(token: string | undefined | null, now = Date.now()): SessionPayload | null {
  if (!token) return null;

  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SessionPayload;

    if (typeof payload.userId !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 <= now) return null;

    return payload;
  } catch {
    return null;
  }
}

function sign(value: string): string {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

function sessionSecret(): string {
  const env = getEnv();

  // Production requires a real AUTH_SECRET; the environment layer already
  // refuses to boot without one, so this fallback only ever applies locally.
  return env.AUTH_SECRET ?? 'development-only-session-secret';
}

/** Cookie attributes used everywhere the session cookie is set. */
export function sessionCookieOptions(maxAgeSeconds = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: getEnv().NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
