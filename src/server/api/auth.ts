import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/server/db/client';
import { RULES, consume } from '@/server/security/rate-limit';

/**
 * API authentication (master spec §127, §129, §130).
 *
 * Bearer tokens rather than sessions: the consumer is a service, not a
 * browser, so there is no CSRF surface and no cookie to protect.
 *
 * The token is stored as a SHA-256 hash with a public prefix. The prefix makes
 * a key identifiable in admin and makes lookup a single indexed read; the hash
 * means a leaked database yields no working credential. Comparison is
 * constant-time.
 */

const TOKEN_PREFIX_LENGTH = 8;

export interface ApiCredential {
  clientId: string;
  name: string;
  /** Empty means platform-wide; otherwise the businesses this key may read. */
  businessIds: string[];
  scopes: string[];
  marketingClientId: string | null;
}

/**
 * Thrown when a key exceeds its window. Separate from {@link ApiAuthError}
 * because 429 is not an authentication outcome and must not be reported as
 * one — a client that retries on 401 would loop forever against a 429.
 */
export class ApiRateLimitError extends Error {
  readonly status = 429;
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('Rate limit exceeded');
    this.name = 'ApiRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ApiAuthError extends Error {
  readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
  }
}

/**
 * Issues a token. The plaintext is returned once and never stored.
 *
 * Hex rather than base64url for both parts: base64url includes `_`, which is
 * also the field delimiter, so a secret containing one would make the token
 * ambiguous to parse. Making the alphabet disjoint from the delimiter removes
 * that failure mode by construction rather than by luck.
 */
export function generateApiToken(): { token: string; prefix: string; hash: string } {
  const prefix = randomBytes(TOKEN_PREFIX_LENGTH / 2).toString('hex');
  const secret = randomBytes(32).toString('hex');
  const token = `dpo_${prefix}_${secret}`;

  return { token, prefix, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Resolves a request's credential, or throws.
 *
 * Every failure mode — missing header, unknown key, revoked key, expired key —
 * produces the same message, so the endpoint cannot be used to probe which
 * keys exist.
 */
export async function authenticateApiRequest(request: Request): Promise<ApiCredential> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());

  if (!match) throw new ApiAuthError('Authentication required');

  const token = (match[1] ?? '').trim();
  const parsed = /^dpo_([0-9a-f]{8})_([0-9a-f]{64})$/.exec(token);

  if (!parsed) throw new ApiAuthError('Authentication required');

  const client = await prisma.apiClient.findUnique({
    where: { tokenPrefix: parsed[1] as string },
    select: {
      id: true,
      name: true,
      tokenHash: true,
      businessIds: true,
      scopes: true,
      isActive: true,
      expiresAt: true,
      marketingClientId: true,
    },
  });

  if (!client) throw new ApiAuthError('Authentication required');

  const provided = Buffer.from(hashToken(token));
  const expected = Buffer.from(client.tokenHash);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new ApiAuthError('Authentication required');
  }

  if (!client.isActive) throw new ApiAuthError('Authentication required');
  if (client.expiresAt && client.expiresAt.getTime() <= Date.now()) {
    throw new ApiAuthError('Authentication required');
  }

  // Best-effort: a failed usage stamp must not fail the request.
  // Limited per key rather than per address: keys are the API's unit of
  // identity, and several of them legitimately share one egress address.
  const limit = consume(RULES.api, client.id);
  if (limit.limited) {
    throw new ApiRateLimitError(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000)));
  }

  prisma.apiClient
    .update({ where: { id: client.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    clientId: client.id,
    name: client.name,
    businessIds: client.businessIds,
    scopes: client.scopes,
    marketingClientId: client.marketingClientId,
  };
}

/**
 * The API's tenant boundary, exactly parallel to the admin one: a business id
 * in a request is a request, not a grant (GOALS I8).
 */
export function assertBusinessInScope(credential: ApiCredential, businessId: string): void {
  if (credential.businessIds.length === 0) return; // platform-wide key
  if (credential.businessIds.includes(businessId)) return;

  // "Not found" rather than "forbidden": the API must not confirm that a
  // business exists to a key that cannot read it.
  throw new ApiAuthError('Not found', 404);
}

/** Where a key is scoped, restricts a query to what it may read. */
export function scopeFilter(credential: ApiCredential): { id?: { in: string[] } } {
  return credential.businessIds.length === 0 ? {} : { id: { in: credential.businessIds } };
}

export function requireScope(credential: ApiCredential, scope: string): void {
  if (!credential.scopes.includes(scope)) {
    throw new ApiAuthError('Insufficient scope', 403);
  }
}
