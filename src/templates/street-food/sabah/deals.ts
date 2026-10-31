import type { OfferSort } from '@/lib/discount';
import { ENDING_SOON_MS } from '@/lib/discount';
import type { MenuItem } from './data/menuData';

/**
 * The automatic "offers & savings" section: every dish with a live discount,
 * the same dish objects as in their own sections (never copies), ordered the
 * way the restaurant chose. Out-of-stock dishes are left out: an offer the
 * customer cannot order is not an offer.
 */

export const DEALS_ID = 'offers-deals';

const time = (iso: string | undefined, fallback: number) => (iso ? new Date(iso).getTime() : fallback);

/** Ascending by end date; no end date sorts after every dated discount. */
const byEnd = (a: string | undefined, b: string | undefined) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return time(a, 0) - time(b, 0);
};

export function dealsOf(items: MenuItem[], sort: OfferSort): MenuItem[] {
  const deals = items.filter((item) => item.sale && !item.isUnavailable && !item.noPrice);
  const by: Record<OfferSort, (a: MenuItem, b: MenuItem) => number> = {
    PERCENT: (a, b) => b.sale!.percent - a.sale!.percent || b.sale!.saving - a.sale!.saving,
    SAVING: (a, b) => b.sale!.saving - a.sale!.saving || b.sale!.percent - a.sale!.percent,
    NEWEST: (a, b) => time(b.sale!.updatedAt, 0) - time(a.sale!.updatedAt, 0),
    // No end date sorts last: it is not ending.
    ENDING: (a, b) => byEnd(a.sale!.endsAt, b.sale!.endsAt),
    MANUAL: (a, b) => a.sale!.sortOrder - b.sale!.sortOrder,
  };
  // Stable: ties keep the menu's own order.
  return deals
    .map((item, index) => ({ item, index }))
    .sort((a, b) => by[sort](a.item, b.item) || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * A badge that rests on the discount's real end date: "ends soon" within two
 * days of it, "limited time" when it has one further off, nothing when it has
 * none. Null `now` (the server render) shows nothing time-dependent.
 */
export function urgency(item: MenuItem, now: number | null): 'ending' | 'limited' | null {
  if (!item.sale?.endsAt || now === null) return null;
  const left = new Date(item.sale.endsAt).getTime() - now;
  if (left <= 0) return null;
  return left <= ENDING_SOON_MS ? 'ending' : 'limited';
}
