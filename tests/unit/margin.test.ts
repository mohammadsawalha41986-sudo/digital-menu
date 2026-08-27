import { describe, expect, it } from 'vitest';
import { computeMargin, summariseMargins } from '@/server/menu-studio/margin';

describe('margin', () => {
  it('computes gross and ratio from real numbers', () => {
    const margin = computeMargin(4000, 1200)!;

    expect(margin.grossMinor).toBe(2800);
    expect(margin.ratio).toBeCloseTo(0.7, 5);
    expect(margin.band).toBe('healthy');
  });

  it('returns nothing when the business entered no cost', () => {
    expect(computeMargin(4000, null)).toBeNull();
  });

  it('returns nothing rather than zero when there is no price', () => {
    expect(computeMargin(null, 1200)).toBeNull();
    expect(computeMargin(0, 0)).toBeNull();
  });

  it('reports a loss honestly instead of clamping it', () => {
    const margin = computeMargin(1000, 1500)!;

    expect(margin.grossMinor).toBe(-500);
    expect(margin.band).toBe('low');
  });

  it('averages only the items that carry a cost, and says how many', () => {
    const summary = summariseMargins([
      { priceMinor: 4000, costMinor: 1000 },
      { priceMinor: 2000, costMinor: 1000 },
      { priceMinor: 3000, costMinor: null },
    ]);

    expect(summary.covered).toBe(2);
    expect(summary.total).toBe(3);
    expect(summary.averageRatio).toBeCloseTo(0.625, 3);
  });

  it('has no average at all when nothing carries a cost', () => {
    const summary = summariseMargins([{ priceMinor: 4000, costMinor: null }]);

    expect(summary.covered).toBe(0);
    expect(summary.averageRatio).toBeNull();
  });
});
