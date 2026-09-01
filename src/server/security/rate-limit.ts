/**
 * Fixed-window rate limiting, shared by every surface that needs it.
 *
 * This is the limiter that already guarded the analytics ingest route,
 * lifted out so login, the versioned API and event ingest all use one
 * implementation rather than three (master spec §164). Each caller supplies
 * its own namespace, window and ceiling, because a login attempt and an
 * analytics beacon are not the same kind of traffic.
 *
 * In-process, and honestly so: it is exact for a single instance and becomes
 * per-instance when a second one is added. Moving it behind Redis (§134)
 * changes this file and nothing that calls it — the shape of `consume` is
 * deliberately storage-agnostic.
 */

export interface RateLimitRule {
  /** Distinguishes one caller's buckets from another's. */
  namespace: string;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Attempts permitted inside one window. */
  max: number;
}

export interface RateLimitResult {
  limited: boolean;
  /** Attempts left in the current window; zero once limited. */
  remaining: number;
  /** When the current window ends. */
  resetAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Bound the map so a flood of distinct keys cannot grow it without limit. */
const MAX_BUCKETS = 20_000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Records one attempt against `identity` and reports whether it is over the
 * limit. Callers should treat `limited: true` as "refuse", not "delay".
 */
export function consume(rule: RateLimitRule, identity: string): RateLimitResult {
  const now = Date.now();
  const key = `${rule.namespace}:${identity}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) sweep(now);
    const resetAt = now + rule.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { limited: false, remaining: rule.max - 1, resetAt };
  }

  bucket.count += 1;

  const limited = bucket.count > rule.max;
  return {
    limited,
    remaining: limited ? 0 : rule.max - bucket.count,
    resetAt: bucket.resetAt,
  };
}

/** Forgets one identity's window — used after a *successful* login. */
export function reset(rule: RateLimitRule, identity: string): void {
  buckets.delete(`${rule.namespace}:${identity}`);
}

/** Test seam. Never called by application code. */
export function clearAll(): void {
  buckets.clear();
}

/**
 * The best client identity a request can offer.
 *
 * Accepts either a `Request` or a bare `Headers`, because a route handler has
 * the first and a server component has only the second.
 *
 * Behind a proxy the socket address is the proxy, so the forwarded chain is
 * consulted first — and only its *first* hop, because later entries are
 * attacker-controlled. When nothing identifies the caller the value is a
 * constant, which makes the whole anonymous population share one bucket:
 * strict rather than permissive, which is the correct direction to fail.
 */
export function clientIdentity(source: Request | Headers): string {
  const headers = source instanceof Headers ? source : source.headers;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Rules used across the application, declared in one place. */
export const RULES = {
  /** Analytics beacons: generous, since one visitor legitimately sends several. */
  events: { namespace: 'events', windowMs: 60_000, max: 60 },
  /** Password attempts per account. Slow enough to make guessing useless. */
  loginAccount: { namespace: 'login:account', windowMs: 15 * 60_000, max: 8 },
  /** Password attempts per client, so one source cannot spray many accounts. */
  loginClient: { namespace: 'login:client', windowMs: 15 * 60_000, max: 25 },
  /** Versioned API, per key. */
  api: { namespace: 'api', windowMs: 60_000, max: 120 },
  /** Client preview tokens, per client — brute-forcing a token is the threat. */
  previewToken: { namespace: 'preview', windowMs: 60_000, max: 30 },
} as const satisfies Record<string, RateLimitRule>;
