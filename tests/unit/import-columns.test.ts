import { describe, expect, it } from 'vitest';
import { autoMapHeaders, normalizeHeader, IMPORT_COLUMNS } from '@/server/import/columns';
import { parseBoolean, validateRows } from '@/server/import/validate';

describe('header matching', () => {
  it('normalises the Unicode variation real Arabic spreadsheets contain', () => {
    // The same word, written with different alef and yeh forms and diacritics.
    expect(normalizeHeader('الاسم')).toBe(normalizeHeader('الأسم'));
    expect(normalizeHeader('السعرات')).toBe(normalizeHeader(' السعرات '));
    expect(normalizeHeader('item_name_ar')).toBe(normalizeHeader('Item Name AR'));
    expect(normalizeHeader('sort-order')).toBe(normalizeHeader('sort order'));
  });

  it('maps canonical English headers', () => {
    const mapping = autoMapHeaders(['item_id', 'category_ar', 'item_name_ar', 'price']);

    expect(mapping).toEqual({
      0: 'item_id',
      1: 'category_ar',
      2: 'item_name_ar',
      3: 'price',
    });
  });

  it('maps a real Arabic header row (master spec §60)', () => {
    const mapping = autoMapHeaders(['القسم', 'اسم الصنف', 'السعر', 'السعرات']);

    expect(mapping).toEqual({
      0: 'category_ar',
      1: 'item_name_ar',
      2: 'price',
      3: 'calories',
    });
  });

  it('maps common alternates', () => {
    const mapping = autoMapHeaders(['SKU', 'Section', 'Item Name', 'Amount']);

    expect(Object.values(mapping)).toEqual([
      'item_id',
      'category_ar',
      'item_name_ar',
      'price',
    ]);
  });

  it('leaves unknown columns unmapped rather than guessing', () => {
    const mapping = autoMapHeaders(['price', 'supplier notes', 'internal ref']);

    expect(mapping[0]).toBe('price');
    expect(mapping[1]).toBeUndefined();
    expect(mapping[2]).toBeUndefined();
  });

  it('never assigns one field to two columns', () => {
    const mapping = autoMapHeaders(['price', 'السعر', 'amount']);
    const assigned = Object.values(mapping);

    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('declares the three required columns the spec names (§59)', () => {
    const required = IMPORT_COLUMNS.filter((column) => column.required).map((c) => c.key);
    expect(required).toEqual(['category_ar', 'item_name_ar', 'price']);
  });
});

describe('boolean parsing (master spec §69)', () => {
  it('reads English and Arabic truth values', () => {
    for (const value of ['TRUE', 'yes', '1', 'نعم', 'متوفر']) {
      expect(parseBoolean(value, false), value).toBe(true);
    }

    for (const value of ['FALSE', 'no', '0', 'لا', 'غير متوفر']) {
      expect(parseBoolean(value, true), value).toBe(false);
    }
  });

  it('falls back for an empty or unrecognised value', () => {
    expect(parseBoolean('', true)).toBe(true);
    expect(parseBoolean('maybe', false)).toBe(false);
  });
});

const mapping = {
  0: 'item_id',
  1: 'category_ar',
  2: 'item_name_ar',
  3: 'price',
  4: 'calories',
  5: 'allergens',
  6: 'image_url',
  7: 'available',
};

function validate(rows: string[][]) {
  return validateRows({
    currency: 'SAR',
    mapping,
    rows,
    rowNumbers: rows.map((_, index) => index + 2),
  });
}

describe('row validation', () => {
  it('accepts a well-formed row', () => {
    const result = validate([['MN-001', 'برجر', 'برجر دجاج', '42', '680', 'gluten', '', 'TRUE']]);

    expect(result.validCount).toBe(1);
    expect(result.rows[0]?.priceMinor).toBe(4200);
    expect(result.rows[0]?.calories).toBe(680);
    expect(result.rows[0]?.allergens).toEqual(['gluten']);
  });

  it('reports row, column, value and a fix for each problem (§63)', () => {
    const result = validate([['', '', '', 'about ten', '', '', '', '']]);

    const columns = result.issues.map((issue) => issue.column);
    expect(columns).toContain('category_ar');
    expect(columns).toContain('item_name_ar');
    expect(columns).toContain('price');

    const priceIssue = result.issues.find((issue) => issue.column === 'price');
    expect(priceIssue?.rowNumber).toBe(2);
    expect(priceIssue?.value).toBe('about ten');
    expect(priceIssue?.suggestion).toMatch(/42/);
  });

  it('leaves calories empty rather than inferring a figure (§37)', () => {
    const result = validate([['MN-002', 'برجر', 'برجر لحم', '45', '', '', '', 'TRUE']]);

    expect(result.rows[0]?.valid).toBe(true);
    expect(result.rows[0]?.calories).toBeNull();
  });

  it('reports unrecognised allergens instead of dropping them silently', () => {
    const result = validate([['MN-003', 'برجر', 'صنف', '10', '', 'gluten, sesame', '', 'TRUE']]);

    const issue = result.issues.find((entry) => entry.column === 'allergens');
    expect(issue?.value).toBe('sesame');
    // The known one still imports; only the unknown is flagged.
    expect(result.rows[0]?.allergens).toEqual(['gluten']);
  });

  it('accepts Arabic allergen spellings', () => {
    const result = validate([['MN-004', 'برجر', 'صنف', '10', '', 'حليب، مكسرات', '', 'TRUE']]);

    expect(result.rows[0]?.allergens).toEqual(['milk', 'nuts']);
  });

  it('does not fail a row for a bad image URL (§70)', () => {
    const result = validate([['MN-005', 'برجر', 'صنف', '10', '', '', 'not-a-url', 'TRUE']]);

    expect(result.rows[0]?.valid).toBe(true);
    expect(result.rows[0]?.imageUrl).toBeNull();
    expect(result.issues.some((issue) => issue.column === 'image_url')).toBe(true);
  });

  it('flags duplicate item codes within one file (§65)', () => {
    const result = validate([
      ['MN-100', 'برجر', 'أ', '10', '', '', '', 'TRUE'],
      ['MN-100', 'برجر', 'ب', '12', '', '', '', 'TRUE'],
    ]);

    expect(result.duplicateCodes).toEqual(['MN-100']);
    expect(result.rows[1]?.valid).toBe(false);
    expect(result.issues.find((issue) => issue.column === 'item_id')?.problem).toMatch(/row 2/);
  });

  it('keeps valid rows importable alongside invalid ones (§64)', () => {
    const result = validate([
      ['MN-200', 'برجر', 'جيد', '10', '', '', '', 'TRUE'],
      ['MN-201', 'برجر', '', 'nonsense', '', '', '', 'TRUE'],
      ['MN-202', 'برجر', 'جيد أيضاً', '12', '', '', '', 'TRUE'],
    ]);

    expect(result.validCount).toBe(2);
    expect(result.invalidCount).toBe(1);
  });

  it('reports missing required columns before any row is read', () => {
    const result = validateRows({
      currency: 'SAR',
      mapping: { 0: 'item_name_ar' },
      rows: [['برجر']],
      rowNumbers: [2],
    });

    expect(result.missingRequiredColumns).toEqual(['category_ar', 'price']);
  });

  it('reads availability in either language', () => {
    const result = validate([
      ['A', 'ق', 'أ', '10', '', '', '', 'متوفر'],
      ['B', 'ق', 'ب', '10', '', '', '', 'غير متوفر'],
    ]);

    expect(result.rows[0]?.availability).toBe('AVAILABLE');
    expect(result.rows[1]?.availability).toBe('UNAVAILABLE');
  });
});
