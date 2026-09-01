import { describe, expect, it } from 'vitest';
import {
  READINESS_DISCLAIMER,
  formatGrams,
  reportBusiness,
  reportItem,
  type NutritionFields,
} from '@/server/nutrition/readiness';

function fields(overrides: Partial<NutritionFields> = {}): NutritionFields {
  return {
    calories: null,
    caffeineMg: null,
    sodiumMg: null,
    proteinDeci: null,
    carbsDeci: null,
    fatDeci: null,
    fibreDeci: null,
    sugarDeci: null,
    servingSizeAr: null,
    servingSizeEn: null,
    allergens: [],
    highSalt: false,
    activityNoteAr: null,
    activityNoteEn: null,
    ...overrides,
  };
}

const COMPLETE = fields({
  calories: 680,
  caffeineMg: 0,
  sodiumMg: 900,
  proteinDeci: 320,
  carbsDeci: 450,
  fatDeci: 280,
  fibreDeci: 40,
  sugarDeci: 60,
  servingSizeAr: '250 غرام',
  allergens: ['gluten'],
  activityNoteEn: 'About a 70-minute walk.',
});

describe('nutrition readiness — the distinction it exists to hold', () => {
  it('never uses the language of compliance', () => {
    // §107: "data missing" must never be presented as "non-compliant", and the
    // reverse must never be presented as compliant.
    const words = /compliant|compliance|approved|certified|meets the requirement/i;

    expect(READINESS_DISCLAIMER).not.toMatch(/\bis compliant\b/i);
    expect(READINESS_DISCLAIMER).toMatch(/not a regulatory assessment/i);

    const report = reportBusiness([{ ...COMPLETE, itemCode: 'A', name: 'Burger' }]);
    expect(JSON.stringify(report)).not.toMatch(words);
  });

  it('reports a fully described item as complete without calling it compliant', () => {
    expect(reportItem(COMPLETE).state).toBe('COMPLETE');
    expect(reportItem(COMPLETE).missing).toEqual([]);
  });
});

describe('nutrition readiness — absent is never zero', () => {
  it('counts a genuine zero as supplied', () => {
    // "0 mg of caffeine" is a statement the business made. It is not missing.
    const report = reportItem(fields({ caffeineMg: 0, sugarDeci: 0 }));

    expect(report.provided).toContain('caffeineMg');
    expect(report.provided).toContain('sugarDeci');
  });

  it('counts an absent value as missing, even beside supplied ones', () => {
    const report = reportItem(fields({ calories: 500 }));

    expect(report.provided).toEqual(['calories']);
    expect(report.missing).toContain('sodiumMg');
  });

  it('never invents a value for a field nobody filled in', () => {
    const report = reportItem(fields());

    expect(report.state).toBe('MISSING');
    expect(report.provided).toEqual([]);
  });
});

describe('nutrition readiness — per item', () => {
  it('accepts a serving size in either language', () => {
    expect(reportItem(fields({ servingSizeAr: '٢٥٠ غرام' })).provided).toContain('servingSize');
    expect(reportItem(fields({ servingSizeEn: '250 g' })).provided).toContain('servingSize');
  });

  it('treats an empty allergen list as not yet stated, which prompts a check', () => {
    expect(reportItem(fields({ allergens: [] })).missing).toContain('allergens');
    expect(reportItem(fields({ allergens: ['milk'] })).provided).toContain('allergens');
  });

  it('accepts an activity note in either language, and never computes one', () => {
    // The figure depends on the person reading it, so only the business writes it.
    expect(reportItem(fields({ activityNoteAr: 'مشي ٧٠ دقيقة' })).provided).toContain(
      'activityNote',
    );
    expect(reportItem(fields({ calories: 900 })).provided).not.toContain('activityNote');
  });

  it('separates core fields from the rest, for the "missing calories" filter', () => {
    const report = reportItem(fields({ sodiumMg: 500 }));

    expect(report.missingCore).toEqual(['calories', 'servingSize', 'allergens']);
  });

  it('calls an item partial when some but not all fields are supplied', () => {
    expect(reportItem(fields({ calories: 600, servingSizeEn: '200 g' })).state).toBe('PARTIAL');
  });
});

describe('nutrition readiness — per business', () => {
  const items = [
    { ...COMPLETE, itemCode: 'A', name: 'Complete' },
    { ...fields({ calories: 400 }), itemCode: 'B', name: 'Partial' },
    { ...fields(), itemCode: 'C', name: 'Nothing' },
  ];

  it('counts items by state', () => {
    const report = reportBusiness(items);

    expect(report.itemsTotal).toBe(3);
    expect(report.itemsComplete).toBe(1);
    expect(report.itemsPartial).toBe(1);
    expect(report.itemsMissing).toBe(1);
  });

  it('reports coverage per field, so gaps are visible at a glance', () => {
    const report = reportBusiness(items);
    const calories = report.coverage.find((field) => field.key === 'calories');

    expect(calories?.provided).toBe(2);
  });

  it('lists the items a person should look at, with what each is missing', () => {
    const report = reportBusiness(items);

    expect(report.needsReview.map((entry) => entry.itemCode)).toEqual(['B', 'C']);
    expect(report.needsReview[0]?.missingCore).toContain('servingSize');
  });

  it('says NEEDS_REVIEW rather than a verdict when core fields are absent', () => {
    expect(reportBusiness(items).overall).toBe('NEEDS_REVIEW');
  });

  it('says COMPLETE only when every item is complete', () => {
    expect(
      reportBusiness([{ ...COMPLETE, itemCode: 'A', name: 'Complete' }]).overall,
    ).toBe('COMPLETE');
  });

  it('says MISSING for a business with no items rather than claiming completeness', () => {
    const report = reportBusiness([]);

    expect(report.overall).toBe('MISSING');
    expect(report.itemsTotal).toBe(0);
  });

  it('caps the review list so a thousand-item menu does not become the page', () => {
    const many = Array.from({ length: 500 }, (_, index) => ({
      ...fields(),
      itemCode: `I${index}`,
      name: `Item ${index}`,
    }));

    expect(reportBusiness(many).needsReview.length).toBeLessThanOrEqual(50);
    expect(reportBusiness(many).itemsMissing).toBe(500);
  });
});

describe('gram formatting', () => {
  it('renders tenths of a gram without floating-point noise', () => {
    expect(formatGrams(320)).toBe('32 g');
    expect(formatGrams(325)).toBe('32.5 g');
    expect(formatGrams(0)).toBe('0 g');
  });

  it('renders nothing at all for an absent value', () => {
    expect(formatGrams(null)).toBeNull();
  });
});
