/**
 * Dish discounts.
 *
 * A discount is stored as the restaurant entered it — a percentage, an amount
 * off, or a final price — and the sale price is computed from the dish's
 * current price whenever it is read. A percentage therefore follows a later
 * price change instead of going quietly stale. All arithmetic is on integer
 * minor units: no float reaches a price.
 *
 * Whether a discount is live is decided at read time from its window, like
 * offers (src/server/offers/scheduling.ts): nothing flips a flag on a timer,
 * so an expired discount cannot linger because a job did not run.
 */

export const DISCOUNT_MODES = ['PERCENT', 'AMOUNT', 'PRICE'] as const;
export type DiscountMode = (typeof DISCOUNT_MODES)[number];

export type DiscountState = 'live' | 'scheduled' | 'expired' | 'disabled';

export interface DiscountRule {
  enabled: boolean;
  mode: DiscountMode | null;
  /** Percent as a whole number (20 = 20%); amount and price in minor units. */
  value: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  /** Branch keys the discount applies in; empty means every branch. */
  branchKeys: string[];
}

export const isDiscountMode = (value: unknown): value is DiscountMode =>
  typeof value === 'string' && (DISCOUNT_MODES as readonly string[]).includes(value);

/**
 * The sale price for a base price, or null when the rule cannot give a real
 * discount: nothing off, a price at or above the original, or a price at or
 * below zero. A null here means the dish is simply sold at its price.
 */
export function salePrice(baseMinor: number | null, mode: DiscountMode | null, value: number | null): number | null {
  if (baseMinor === null || baseMinor <= 0 || mode === null || value === null || !Number.isInteger(value)) return null;
  let sale: number;
  if (mode === 'PERCENT') {
    if (value <= 0 || value >= 100) return null;
    // Integer arithmetic, rounded half up to the nearest minor unit.
    sale = Math.floor((baseMinor * (100 - value) + 50) / 100);
  } else if (mode === 'AMOUNT') {
    sale = baseMinor - value;
  } else {
    sale = value;
  }
  return sale > 0 && sale < baseMinor ? sale : null;
}

/** The whole-number percentage a sale price saves, for the badge. */
export function percentOff(baseMinor: number, saleMinor: number): number {
  return Math.round(((baseMinor - saleMinor) * 100) / baseMinor);
}

export function discountState(rule: Pick<DiscountRule, 'enabled' | 'startsAt' | 'endsAt'>, now: Date): DiscountState {
  if (!rule.enabled) return 'disabled';
  if (rule.startsAt && rule.startsAt.getTime() > now.getTime()) return 'scheduled';
  // The end is exclusive: a discount ending at 23:00 is over at 23:00.
  if (rule.endsAt && rule.endsAt.getTime() <= now.getTime()) return 'expired';
  return 'live';
}

/** Whether the discount applies in a branch view (no branch: the main menu). */
export function appliesInBranch(rule: Pick<DiscountRule, 'branchKeys'>, branchKey: string | null): boolean {
  if (rule.branchKeys.length === 0) return true;
  return branchKey !== null && rule.branchKeys.includes(branchKey);
}

export interface LiveDiscount {
  originalMinor: number;
  saleMinor: number;
  percent: number;
  savingMinor: number;
  mode: DiscountMode;
  /** The configured percentage, for a PERCENT discount; else null. */
  rate: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** The discount as a customer sees it now, or null when none applies. */
export function liveDiscount(
  rule: DiscountRule,
  baseMinor: number | null,
  now: Date,
  branchKey: string | null,
): LiveDiscount | null {
  if (discountState(rule, now) !== 'live' || !appliesInBranch(rule, branchKey) || baseMinor === null) return null;
  const sale = salePrice(baseMinor, rule.mode, rule.value);
  if (sale === null || rule.mode === null) return null;
  return {
    originalMinor: baseMinor,
    saleMinor: sale,
    percent: percentOff(baseMinor, sale),
    savingMinor: baseMinor - sale,
    mode: rule.mode,
    rate: rule.mode === 'PERCENT' ? rule.value : null,
    startsAt: rule.startsAt,
    endsAt: rule.endsAt,
  };
}

/**
 * An option's price under a percentage discount that also covers add-ons.
 * Amount-off and fixed-price discounts never change options: a fixed amount
 * is taken once from the dish, not again from every extra.
 */
export function discountedOptionPrice(deltaMinor: number, discount: LiveDiscount | null, includesOptions: boolean): number {
  if (!discount || !includesOptions || discount.rate === null || deltaMinor <= 0) return deltaMinor;
  return Math.floor((deltaMinor * (100 - discount.rate) + 50) / 100);
}

export const OFFER_SORTS = ['PERCENT', 'SAVING', 'NEWEST', 'ENDING', 'MANUAL'] as const;
export type OfferSort = (typeof OFFER_SORTS)[number];
export const isOfferSort = (value: unknown): value is OfferSort =>
  typeof value === 'string' && (OFFER_SORTS as readonly string[]).includes(value);

/** Within this long of its end a discount is marked "ending soon". */
export const ENDING_SOON_MS = 48 * 60 * 60 * 1000;
