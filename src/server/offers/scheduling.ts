/**
 * Offer scheduling (master spec §42).
 *
 * The central decision: **activation and expiry are computed at read time**,
 * not written by a scheduled job.
 *
 * A cron that flips an `isActive` flag has a failure mode the spec forbids —
 * if it does not run, an expired offer stays on a customer's menu, and stale
 * promotional pricing is the kind of error that ends up in a complaint. A
 * window comparison at read time cannot fail that way: worst case the page is
 * not rendered at all.
 *
 * The cost is a predicate on every read, which the composite index covers.
 */

export interface OfferWindow {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export type OfferState = 'live' | 'scheduled' | 'expired' | 'disabled';

/**
 * Resolves an offer's state at an instant.
 *
 * Both bounds are optional and mean different things:
 *  - no `startsAt` — live as soon as it is enabled.
 *  - no `endsAt` — runs until staff disable it.
 */
export function offerState(offer: OfferWindow, now: Date = new Date()): OfferState {
  if (!offer.isActive) return 'disabled';
  if (offer.startsAt && offer.startsAt.getTime() > now.getTime()) return 'scheduled';
  // The end bound is exclusive: an offer ending at 23:00 is over at 23:00.
  if (offer.endsAt && offer.endsAt.getTime() <= now.getTime()) return 'expired';
  return 'live';
}

export function isOfferLive(offer: OfferWindow, now: Date = new Date()): boolean {
  return offerState(offer, now) === 'live';
}

/**
 * The Prisma `where` fragment that selects live offers.
 *
 * Kept next to `offerState` so the database predicate and the in-memory
 * predicate cannot drift apart — if they did, an offer could be selected by a
 * query and then judged expired by the renderer, or worse, the reverse.
 */
export function liveOfferWhere(now: Date = new Date()) {
  return {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
  };
}

/**
 * Computes the discount an offer represents, as a percentage.
 *
 * Returns null rather than a guess when the numbers do not support one: a
 * discount shown to a visitor must be arithmetic, not marketing (GOALS I9).
 */
export function discountPercent(
  originalMinor: number | null,
  offerMinor: number | null,
  stated: number | null,
): number | null {
  if (stated !== null && stated > 0 && stated < 100) return stated;

  if (
    originalMinor === null ||
    offerMinor === null ||
    originalMinor <= 0 ||
    offerMinor < 0 ||
    offerMinor >= originalMinor
  ) {
    return null;
  }

  return Math.round(((originalMinor - offerMinor) / originalMinor) * 100);
}

export class OfferWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfferWindowError';
  }
}

/** Rejects a window that could never be live, rather than storing it. */
export function assertValidWindow(startsAt: Date | null, endsAt: Date | null): void {
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new OfferWindowError('The offer would end before it starts');
  }
}
