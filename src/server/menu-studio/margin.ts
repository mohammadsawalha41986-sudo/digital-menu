/**
 * Menu profitability (Menu Studio §39).
 *
 * The whole module is conditional on data the business entered. Where a cost
 * is absent, every function here returns null and the studio shows nothing —
 * it does not show a zero, an estimate, or an industry average. A fabricated
 * margin would be acted on as if it were real, which is worse than a blank
 * cell (GOALS I9).
 *
 * Demand indicators are deliberately absent: this platform is browse-only and
 * records no orders, so "popular" here could only ever be a guess.
 */

export interface Margin {
  /** Selling price minus cost, in minor units. */
  grossMinor: number;
  /** Gross margin as a fraction of the selling price, 0–1. */
  ratio: number;
  band: 'low' | 'healthy' | 'high';
}

/** Bands follow common restaurant practice: food cost of 30% is the usual target. */
const HEALTHY_FLOOR = 0.6;
const HIGH_FLOOR = 0.75;

export function computeMargin(priceMinor: number | null, costMinor: number | null): Margin | null {
  if (priceMinor === null || costMinor === null) return null;
  if (priceMinor <= 0) return null;

  const grossMinor = priceMinor - costMinor;
  const ratio = grossMinor / priceMinor;

  return {
    grossMinor,
    ratio,
    band: ratio >= HIGH_FLOOR ? 'high' : ratio >= HEALTHY_FLOOR ? 'healthy' : 'low',
  };
}

export interface MenuCostSummary {
  /** Items that carry a cost. The rest are excluded, not assumed. */
  covered: number;
  total: number;
  averageRatio: number | null;
}

export function summariseMargins(
  items: readonly { priceMinor: number | null; costMinor: number | null }[],
): MenuCostSummary {
  const margins = items
    .map((item) => computeMargin(item.priceMinor, item.costMinor))
    .filter((margin): margin is Margin => margin !== null);

  return {
    covered: margins.length,
    total: items.length,
    averageRatio:
      margins.length === 0
        ? null
        : margins.reduce((sum, margin) => sum + margin.ratio, 0) / margins.length,
  };
}
