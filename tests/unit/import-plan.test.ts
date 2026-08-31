import { describe, expect, it } from 'vitest';
import { planImport, type ExistingItem } from '@/server/import/plan';
import type { ValidatedRow } from '@/server/import/validate';

function row(overrides: Partial<ValidatedRow> & { rowNumber: number }): ValidatedRow {
  return {
    valid: true,
    itemCode: null,
    categoryAr: 'الأطباق',
    categoryEn: 'Mains',
    subcategoryAr: null,
    subcategoryEn: null,
    nameAr: 'برجر',
    nameEn: 'Burger',
    descriptionAr: null,
    descriptionEn: null,
    priceMinor: 4200,
    costMinor: null,
    calories: null,
    servingSize: null,
    ingredientsAr: null,
    ingredientsEn: null,
    allergens: [],
    tags: [],
    imageUrl: null,
    featured: false,
    availability: 'AVAILABLE',
    sortOrder: 0,
    menuKey: null,
    branchKey: null,
    ...overrides,
  } as ValidatedRow;
}

function existing(overrides: Partial<ExistingItem> & { itemCode: string }): ExistingItem {
  return {
    nameAr: 'برجر',
    nameEn: 'Burger',
    descriptionAr: null,
    descriptionEn: null,
    priceMinor: 3800,
    calories: null,
    categoryKey: 'mains',
    categoryNameAr: 'الأطباق',
    availability: 'AVAILABLE',
    isFeatured: false,
    ...overrides,
  };
}

describe('import plan — classification', () => {
  it('counts new, updated, unchanged and failed separately', () => {
    const plan = planImport(
      [
        row({ rowNumber: 2, itemCode: 'A', priceMinor: 4200 }), // update
        row({ rowNumber: 3, itemCode: 'B', priceMinor: 3800 }), // unchanged
        row({ rowNumber: 4, itemCode: 'C' }), // create
        row({ rowNumber: 5, valid: false }), // error
      ],
      [existing({ itemCode: 'A' }), existing({ itemCode: 'B', priceMinor: 3800 })],
    );

    expect(plan.counts).toEqual({ create: 1, update: 1, unchanged: 1, error: 1 });
  });

  it('reports a price move with both figures, which is the point of the screen', () => {
    const plan = planImport(
      [row({ rowNumber: 2, itemCode: 'A', priceMinor: 4200 })],
      [existing({ itemCode: 'A', priceMinor: 3800 })],
    );

    expect(plan.priceChanges).toHaveLength(1);
    expect(plan.priceChanges[0]?.priceChange).toEqual({ from: 3800, to: 4200 });
  });

  it('lists every field that moves, not just the price', () => {
    const plan = planImport(
      [
        row({
          rowNumber: 2,
          itemCode: 'A',
          nameEn: 'Grilled Burger',
          calories: 720,
          featured: true,
        }),
      ],
      [existing({ itemCode: 'A', nameEn: 'Burger', calories: null, isFeatured: false })],
    );

    const fields = plan.rows[0]!.changes.map((change) => change.field).sort();

    expect(fields).toEqual(['Calories', 'English name', 'Featured', 'Price']);
  });

  it('calls a row unchanged when nothing at all moves', () => {
    const plan = planImport(
      [row({ rowNumber: 2, itemCode: 'A', priceMinor: 3800 })],
      [existing({ itemCode: 'A', priceMinor: 3800 })],
    );

    expect(plan.rows[0]?.outcome).toBe('UNCHANGED');
    expect(plan.rows[0]?.changes).toEqual([]);
  });

  it('treats blank and absent as the same value, so whitespace is not a change', () => {
    const plan = planImport(
      [row({ rowNumber: 2, itemCode: 'A', priceMinor: 3800, descriptionEn: '   ' })],
      [existing({ itemCode: 'A', priceMinor: 3800, descriptionEn: null })],
    );

    expect(plan.rows[0]?.outcome).toBe('UNCHANGED');
  });

  it('treats a row with no item code as new, never as a name match', () => {
    // Matching on name would silently overwrite a different dish that shares one.
    const plan = planImport(
      [row({ rowNumber: 2, itemCode: null, nameAr: 'برجر' })],
      [existing({ itemCode: 'A', nameAr: 'برجر' })],
    );

    expect(plan.rows[0]?.outcome).toBe('CREATE');
  });
});

describe('import plan — conflicts', () => {
  it('catches the same item code appearing twice in one file', () => {
    const plan = planImport(
      [row({ rowNumber: 2, itemCode: 'A' }), row({ rowNumber: 7, itemCode: 'A' })],
      [existing({ itemCode: 'A' })],
    );

    const conflict = plan.conflicts.find((c) => c.kind === 'duplicate_in_file');

    expect(conflict?.subject).toBe('A');
    expect(conflict?.rowNumbers).toEqual([2, 7]);
    expect(conflict?.detail).toMatch(/last one would win/);
  });

  it('announces categories the file would create', () => {
    const plan = planImport(
      [row({ rowNumber: 2, categoryAr: 'المشروبات' })],
      [existing({ itemCode: 'A', categoryNameAr: 'الأطباق' })],
    );

    expect(plan.newCategories).toEqual(['المشروبات']);
    expect(plan.conflicts.some((c) => c.kind === 'category_new')).toBe(true);
  });

  it('warns when rows have no code, and says how to fix it', () => {
    const plan = planImport([row({ rowNumber: 2 }), row({ rowNumber: 3 })], []);

    const conflict = plan.conflicts.find((c) => c.kind === 'code_missing');

    expect(conflict?.rowNumbers).toEqual([2, 3]);
    expect(conflict?.detail).toMatch(/export first/);
  });

  it('finds no conflicts in a clean update', () => {
    const plan = planImport(
      [row({ rowNumber: 2, itemCode: 'A', priceMinor: 4200 })],
      [existing({ itemCode: 'A' })],
    );

    expect(plan.conflicts).toEqual([]);
  });
});

describe('import plan — errors', () => {
  it('carries the reason a row failed, rather than a bare count', () => {
    const plan = planImport(
      [row({ rowNumber: 4, valid: false })],
      [],
      { issuesByRow: new Map([[4, ['Price is not a number']]]) },
    );

    expect(plan.rows[0]?.outcome).toBe('ERROR');
    expect(plan.rows[0]?.problems).toEqual(['Price is not a number']);
  });

  it('never leaves a failed row without an explanation', () => {
    const plan = planImport([row({ rowNumber: 4, valid: false })], []);
    expect(plan.rows[0]?.problems[0]).toBeTruthy();
  });

  it('does not plan changes for a row it cannot read', () => {
    const plan = planImport(
      [row({ rowNumber: 4, valid: false, itemCode: 'A', priceMinor: 9900 })],
      [existing({ itemCode: 'A' })],
    );

    expect(plan.rows[0]?.changes).toEqual([]);
    expect(plan.priceChanges).toEqual([]);
  });
});

describe('import plan — scale', () => {
  it('handles five hundred rows without losing count', () => {
    const rows = Array.from({ length: 500 }, (_, index) =>
      row({ rowNumber: index + 2, itemCode: `I${index}`, priceMinor: 5000 }),
    );
    const items = Array.from({ length: 300 }, (_, index) =>
      existing({ itemCode: `I${index}`, priceMinor: 4000 }),
    );

    const plan = planImport(rows, items);

    expect(plan.counts.update).toBe(300);
    expect(plan.counts.create).toBe(200);
    expect(plan.priceChanges).toHaveLength(300);
  });
});
