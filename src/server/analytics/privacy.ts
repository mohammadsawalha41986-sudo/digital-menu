import { createHmac } from 'node:crypto';
import { getEnv } from '@/lib/env';

/**
 * Privacy-conscious visitor identification (master spec §110, §113).
 *
 * The product needs to answer "how many people looked at this menu today",
 * which requires distinguishing two visits — but nothing more. So instead of a
 * cookie or a stored IP:
 *
 *   hash = HMAC(secret, ip + user-agent + businessId + calendar-day)
 *
 * Properties that follow from that construction:
 *  - **Not reversible.** The IP is never stored; only its keyed digest is, and
 *    the digest is truncated.
 *  - **Rotates daily.** Yesterday's hash for the same visitor is a different
 *    value, so visits cannot be joined into a history.
 *  - **Scoped per business.** The same person visiting two businesses produces
 *    two unrelated hashes, so nothing can be correlated across tenants.
 *
 * The IP and user agent are read from the request and discarded in the same
 * function; they never reach the database.
 */

export function visitorHash(input: {
  ip: string | null;
  userAgent: string | null;
  businessId: string;
  now?: Date;
}): string | null {
  const env = getEnv();
  const secret = env.ANALYTICS_SALT ?? env.AUTH_SECRET;

  // Without a secret there is no non-reversible hash to compute, and a
  // predictable one would be worse than none: count the visit anonymously.
  if (!secret) return null;

  const day = (input.now ?? new Date()).toISOString().slice(0, 10);
  const material = [input.ip ?? 'unknown', input.userAgent ?? 'unknown', input.businessId, day];

  return createHmac('sha256', secret).update(material.join('|')).digest('hex').slice(0, 32);
}

/**
 * Coarse device class from the user agent.
 *
 * Three buckets, because that is all the reporting needs (§110). The full
 * string is never stored — it is a strong fingerprinting signal and answers no
 * question the product asks.
 */
export function deviceCategory(userAgent: string | null): 'MOBILE' | 'TABLET' | 'DESKTOP' | 'UNKNOWN' {
  if (!userAgent) return 'UNKNOWN';

  const value = userAgent.toLowerCase();

  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(value)) return 'TABLET';
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(value)) return 'MOBILE';
  if (/mozilla|chrome|safari|firefox|edge/.test(value)) return 'DESKTOP';

  return 'UNKNOWN';
}

/**
 * Best-effort client IP.
 *
 * Only used as hash material and never stored. Proxy headers are attacker-
 * controllable, which is acceptable here: the worst outcome is a slightly
 * inflated unique count, and the alternative — trusting them for anything
 * that matters — would not be.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;

  return headers.get('x-real-ip') ?? headers.get('cf-connecting-ip');
}
