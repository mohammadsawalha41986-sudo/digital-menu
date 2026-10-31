import { describe, expect, it } from 'vitest';
import {
  appliesInBranch,
  discountedOptionPrice,
  discountState,
  liveDiscount,
  percentOff,
  salePrice,
  type DiscountRule,
} from '@/lib/discount';
import { dealsOf, urgency } from '@/templates/street-food/sabah/deals';
import type { MenuItem } from '@/templates/street-food/sabah/data/menuData';

const NOW = new Date('2026-11-01T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

const rule = (overrides: Partial<DiscountRule> = {}): DiscountRule => ({
  enabled: true,
  mode: 'PERCENT',
  value: 20,
  startsAt: null,
  endsAt: null,
  branchKeys: [],
  ...overrides,
});

describe('salePrice', () => {
  it('takes a percentage off in minor units: 45 SAR at 20% is 36 SAR', () => {
    expect(salePrice(4500, 'PERCENT', 20)).toBe(3600);
  });

  it('rounds half up to the minor unit and never produces a float', () => {
    // 33.33 SAR (3333) at 20% off is 26.664 -> 2666 halalas.
    expect(salePrice(3333, 'PERCENT', 20)).toBe(2666);
    // 125 minor at 50% is 62.5, which rounds half up to 63.
    expect(salePrice(125, 'PERCENT', 50)).toBe(63);
    expect(Number.isInteger(salePrice(999, 'PERCENT', 33)!)).toBe(true);
  });

  it('takes a fixed amount off: 45 SAR less 9 SAR is 36 SAR', () => {
    expect(salePrice(4500, 'AMOUNT', 900)).toBe(3600);
  });

  it('uses a final price as given', () => {
    expect(salePrice(4500, 'PRICE', 3600)).toBe(3600);
  });

  it('refuses a discount that is not a real one', () => {
    expect(salePrice(4500, 'PERCENT', 0)).toBeNull();
    expect(salePrice(4500, 'PERCENT', 100)).toBeNull();
    expect(salePrice(4500, 'PERCENT', 150)).toBeNull();
    expect(salePrice(4500, 'AMOUNT', 4500)).toBeNull(); // would be zero
    expect(salePrice(4500, 'AMOUNT', 9000)).toBeNull(); // negative
    expect(salePrice(4500, 'PRICE', 4500)).toBeNull(); // not below the original
    expect(salePrice(4500, 'PRICE', 0)).toBeNull();
    expect(salePrice(4500, 'PERCENT', 2.5)).toBeNull(); // not whole
    expect(salePrice(null, 'PERCENT', 20)).toBeNull(); // no price, no discount
    expect(salePrice(0, 'PERCENT', 20)).toBeNull();
  });

  it('keeps three-decimal currencies exact', () => {
    // 4.250 KWD at 10% -> 3.825 KWD = 3825 fils
    expect(salePrice(4250, 'PERCENT', 10)).toBe(3825);
  });
});

describe('percentOff', () => {
  it('reports the whole percentage saved, for the badge', () => {
    expect(percentOff(4500, 3600)).toBe(20);
    expect(percentOff(1000, 667)).toBe(33);
  });
});

describe('discountState', () => {
  it('is disabled when switched off, whatever the dates say', () => {
    expect(discountState(rule({ enabled: false }), NOW)).toBe('disabled');
  });

  it('is scheduled before its start, live inside, expired from its end on', () => {
    const window = { startsAt: new Date(NOW.getTime() + day), endsAt: new Date(NOW.getTime() + 2 * day) };
    expect(discountState(rule(window), NOW)).toBe('scheduled');
    expect(discountState(rule({ startsAt: new Date(NOW.getTime() - day), endsAt: new Date(NOW.getTime() + day) }), NOW)).toBe('live');
    // The end is exclusive: a discount ending at this instant is over.
    expect(discountState(rule({ endsAt: NOW }), NOW)).toBe('expired');
    expect(discountState(rule({ endsAt: new Date(NOW.getTime() - 1) }), NOW)).toBe('expired');
  });

  it('is live with no dates at all, until switched off', () => {
    expect(discountState(rule(), NOW)).toBe('live');
  });
});

describe('branches', () => {
  it('applies everywhere when no branch is chosen, and only in the chosen ones otherwise', () => {
    expect(appliesInBranch(rule({ branchKeys: [] }), null)).toBe(true);
    expect(appliesInBranch(rule({ branchKeys: ['north'] }), 'north')).toBe(true);
    expect(appliesInBranch(rule({ branchKeys: ['north'] }), 'south')).toBe(false);
    // The main menu (no branch) does not get a branch-only discount.
    expect(appliesInBranch(rule({ branchKeys: ['north'] }), null)).toBe(false);
  });
});

describe('liveDiscount', () => {
  it('gives the sale, the original and the saving for a live discount', () => {
    const live = liveDiscount(rule(), 4500, NOW, null);
    expect(live).toMatchObject({ originalMinor: 4500, saleMinor: 3600, percent: 20, savingMinor: 900, rate: 20 });
  });

  it('gives nothing for a scheduled, expired, disabled or out-of-branch discount', () => {
    expect(liveDiscount(rule({ startsAt: new Date(NOW.getTime() + day) }), 4500, NOW, null)).toBeNull();
    expect(liveDiscount(rule({ endsAt: new Date(NOW.getTime() - day) }), 4500, NOW, null)).toBeNull();
    expect(liveDiscount(rule({ enabled: false }), 4500, NOW, null)).toBeNull();
    expect(liveDiscount(rule({ branchKeys: ['north'] }), 4500, NOW, 'south')).toBeNull();
    expect(liveDiscount(rule(), null, NOW, null)).toBeNull();
  });

  it('reports the rate only for a percentage discount', () => {
    expect(liveDiscount(rule({ mode: 'AMOUNT', value: 900 }), 4500, NOW, null)?.rate).toBeNull();
  });
});

describe('option prices under a discount', () => {
  it('leaves options alone unless the restaurant turned it on', () => {
    const discount = liveDiscount(rule(), 4500, NOW, null)!;
    expect(discountedOptionPrice(1000, discount, false)).toBe(1000);
  });

  it('takes the percentage off a paid option when it applies to options, and never off a saving', () => {
    const discount = liveDiscount(rule(), 4500, NOW, null)!;
    expect(discountedOptionPrice(1000, discount, true)).toBe(800);
    expect(discountedOptionPrice(-300, discount, true)).toBe(-300);
    // A fixed amount is taken once, from the dish, not from every option.
    const fixed = liveDiscount(rule({ mode: 'AMOUNT', value: 900 }), 4500, NOW, null)!;
    expect(discountedOptionPrice(1000, fixed, true)).toBe(1000);
  });
});

describe('the automatic offers section', () => {
  const dish = (code: string, price: number, sale: Partial<NonNullable<MenuItem['sale']>>, extra: Partial<MenuItem> = {}): MenuItem => ({
    id: code,
    nameAr: code,
    nameEn: code,
    categoryId: 'c',
    price: price / 100,
    sale: { originalPrice: 0, percent: 0, saving: 0, sortOrder: 0, ...sale },
    ...extra,
  });

  const items = [
    dish('A', 3600, { percent: 20, saving: 9, sortOrder: 2, updatedAt: '2026-10-30T00:00:00Z', endsAt: '2026-11-05T00:00:00Z' }),
    dish('B', 2000, { percent: 35, saving: 10, sortOrder: 0, updatedAt: '2026-10-29T00:00:00Z' }),
    dish('C', 5000, { percent: 10, saving: 5, sortOrder: 1, updatedAt: '2026-10-31T00:00:00Z', endsAt: '2026-11-01T20:00:00Z' }),
    dish('D', 1000, { percent: 50, saving: 5, sortOrder: 3, updatedAt: '2026-10-28T00:00:00Z' }, { isUnavailable: true }),
    dish('E', 1000, { percent: 50, saving: 5, sortOrder: 3 }, {}),
  ];

  it('is ordered by highest percentage by default, leaving out unavailable dishes', () => {
    expect(dealsOf(items, 'PERCENT').map((item) => item.id)).toEqual(['E', 'B', 'A', 'C']);
  });

  it('orders by saving, newest, ending soonest and the restaurant’s own order', () => {
    // B saves most; A next; E and C both save 5, and E has the higher percentage.
    expect(dealsOf(items, 'SAVING').map((item) => item.id)).toEqual(['B', 'A', 'E', 'C']);
    expect(dealsOf(items, 'NEWEST').map((item) => item.id)).toEqual(['C', 'A', 'B', 'E']);
    // Ending soonest first; a discount with no end date comes last.
    expect(dealsOf(items, 'ENDING').map((item) => item.id)).toEqual(['C', 'A', 'B', 'E']);
    expect(dealsOf(items, 'MANUAL').map((item) => item.id)).toEqual(['B', 'C', 'A', 'E']);
  });

  it('marks a discount ending within two days, and only a dated one', () => {
    const soon = dish('S', 1000, { percent: 10, saving: 1, endsAt: new Date(Date.now() + day).toISOString() });
    const later = dish('L', 1000, { percent: 10, saving: 1, endsAt: new Date(Date.now() + 10 * day).toISOString() });
    const open = dish('O', 1000, { percent: 10, saving: 1 });
    const now = Date.now();
    expect(urgency(soon, now)).toBe('ending');
    expect(urgency(later, now)).toBe('limited');
    expect(urgency(open, now)).toBeNull();
    // The server render has no clock, so nothing time-dependent is shown there.
    expect(urgency(soon, null)).toBeNull();
  });
});
