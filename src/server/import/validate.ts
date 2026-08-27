import { parsePriceToMinor } from '@/lib/money';
import { REQUIRED_COLUMNS } from './columns';

/**
 * Row validation (master spec §61, §62, §63).
 *
 * Every problem is reported as row + column + value + what is wrong + how to
 * fix it, because that is what an operator needs to repair a 400-row
 * spreadsheet — not a count of failures.
 *
 * Valid rows are importable even when others fail (§64): a single bad price
 * must not block an entire menu update.
 */

export interface ValidationIssue {
  rowNumber: number;
  column: string;
  value: string;
  problem: string;
  /** Concrete correction, not a restatement of the problem. */
  suggestion: string;
  /**
   * `error` blocks the row; `warning` is reported and imported anyway.
   *
   * The distinction is whether the platform would have to *invent* something
   * to proceed. An unreadable price would; a cost above the price would not —
   * loss leaders are real, so that is worth saying and not worth refusing.
   */
  severity: 'error' | 'warning';
}

export interface ValidatedRow {
  rowNumber: number;
  valid: boolean;
  itemCode: string | null;
  categoryAr: string;
  subcategoryAr: string | null;
  subcategoryEn: string | null;
  categoryEn: string | null;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  priceMinor: number | null;
  costMinor: number | null;
  calories: number | null;
  servingSize: string | null;
  ingredientsAr: string | null;
  ingredientsEn: string | null;
  allergens: string[];
  tags: string[];
  imageUrl: string | null;
  featured: boolean;
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  sortOrder: number;
  menuKey: string | null;
  branchKey: string | null;
  issues: ValidationIssue[];
}

export interface ValidationSummary {
  rows: ValidatedRow[];
  issues: ValidationIssue[];
  validCount: number;
  invalidCount: number;
  /** Duplicate item codes within the file itself (§65). */
  duplicateCodes: string[];
  missingRequiredColumns: string[];
}

const KNOWN_ALLERGENS = [
  'gluten',
  'milk',
  'egg',
  'nuts',
  'peanuts',
  'soy',
  'fish',
  'shellfish',
] as const;

/** Arabic and English spellings staff actually type for the allergen list. */
const ALLERGEN_ALIASES: Record<string, (typeof KNOWN_ALLERGENS)[number]> = {
  جلوتين: 'gluten',
  غلوتين: 'gluten',
  حليب: 'milk',
  الحليب: 'milk',
  بيض: 'egg',
  البيض: 'egg',
  مكسرات: 'nuts',
  المكسرات: 'nuts',
  'فول سوداني': 'peanuts',
  صويا: 'soy',
  سمك: 'fish',
  أسماك: 'fish',
  محار: 'shellfish',
  dairy: 'milk',
  eggs: 'egg',
  treenuts: 'nuts',
  'tree nuts': 'nuts',
};

const TRUE_VALUES = new Set(['true', 'yes', '1', 'y', 'نعم', 'متوفر', 'متاح']);
const FALSE_VALUES = new Set(['false', 'no', '0', 'n', 'لا', 'غير متوفر', 'غير متاح']);

export interface ValidateOptions {
  currency: string;
  /** Column mapping: spreadsheet column index → canonical field key. */
  mapping: Record<number, string>;
  rows: string[][];
  rowNumbers: number[];
}

export function validateRows(options: ValidateOptions): ValidationSummary {
  const mapped = new Set(Object.values(options.mapping));
  const missingRequiredColumns = REQUIRED_COLUMNS.filter((key) => !mapped.has(key));

  const issues: ValidationIssue[] = [];
  const rows: ValidatedRow[] = [];
  const seenCodes = new Map<string, number>();
  const duplicateCodes: string[] = [];

  options.rows.forEach((values, index) => {
    const rowNumber = options.rowNumbers[index] ?? index + 2;
    const get = (key: string): string => {
      const entry = Object.entries(options.mapping).find(([, field]) => field === key);
      if (!entry) return '';
      return values[Number(entry[0])] ?? '';
    };

    const rowIssues: ValidationIssue[] = [];
    const record = (
      severity: 'error' | 'warning',
      column: string,
      value: string,
      problem: string,
      suggestion: string,
    ) => {
      const issue = { rowNumber, column, value, problem, suggestion, severity };
      rowIssues.push(issue);
      issues.push(issue);
    };

    const fail = (column: string, value: string, problem: string, suggestion: string) =>
      record('error', column, value, problem, suggestion);
    const warn = (column: string, value: string, problem: string, suggestion: string) =>
      record('warning', column, value, problem, suggestion);

    const itemCode = get('item_id').trim().toUpperCase() || null;
    const categoryAr = get('category_ar').trim();
    const nameAr = get('item_name_ar').trim();
    const rawPrice = get('price').trim();

    if (!categoryAr) {
      fail('category_ar', '', 'Category is required', 'Add the Arabic category name');
    }

    if (!nameAr) {
      fail('item_name_ar', '', 'Item name is required', 'Add the Arabic item name');
    }

    let priceMinor: number | null = null;
    if (rawPrice === '') {
      fail('price', '', 'Price is required', 'Enter a number such as 42 or 42.50');
    } else {
      priceMinor = parsePriceToMinor(rawPrice, options.currency);
      if (priceMinor === null) {
        fail(
          'price',
          rawPrice,
          'Price could not be read',
          `Use digits only, such as 42 or 42.50 (${options.currency})`,
        );
      }
    }

    // Cost is optional everywhere. A blank cell means the business has not
    // told us the cost — margin is then simply not shown (§39; GOALS I9).
    const rawCost = get('cost').trim();
    let costMinor: number | null = null;
    if (rawCost !== '') {
      costMinor = parsePriceToMinor(rawCost, options.currency);
      if (costMinor === null) {
        fail(
          'cost',
          rawCost,
          'Cost could not be read',
          `Use digits only, such as 12 or 12.50 (${options.currency})`,
        );
      } else if (priceMinor !== null && costMinor > priceMinor) {
        // Not an error: restaurants do sell loss leaders. Worth saying aloud.
        warn(
          'cost',
          rawCost,
          'Cost is higher than the price',
          'The item would sell at a loss. Import proceeds — check the figure is right.',
        );
      }
    }

    let calories: number | null = null;
    const rawCalories = get('calories').trim();
    if (rawCalories !== '') {
      const parsed = Number.parseInt(rawCalories.replace(/[^\d]/g, ''), 10);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 20000) {
        fail(
          'calories',
          rawCalories,
          'Calories could not be read',
          'Use a whole number such as 680, or leave the cell empty',
        );
      } else {
        calories = parsed;
      }
    }

    const { allergens, unknown } = parseAllergens(get('allergens'));
    if (unknown.length > 0) {
      // Reported, not silently dropped: a missing allergen is a safety matter.
      fail(
        'allergens',
        unknown.join(', '),
        'Unrecognised allergen values',
        `Use one of: ${KNOWN_ALLERGENS.join(', ')}`,
      );
    }

    const imageUrl = get('image_url').trim() || null;
    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      // A bad image URL never fails the row (§70) — the item still imports.
      warn(
        'image_url',
        imageUrl,
        'Image URL is not an http(s) link — the item will import without an image',
        'Use a full URL beginning with https://',
      );
    }

    const rawSort = get('sort_order').trim();
    let sortOrder = 0;
    if (rawSort !== '') {
      const parsed = Number.parseInt(rawSort, 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        fail('sort_order', rawSort, 'Sort order must be a whole number', 'Use 0, 1, 2 …');
      } else {
        sortOrder = parsed;
      }
    }

    const availability = parseBoolean(get('available'), true) ? 'AVAILABLE' : 'UNAVAILABLE';

    if (itemCode) {
      const previous = seenCodes.get(itemCode);
      if (previous !== undefined) {
        duplicateCodes.push(itemCode);
        fail(
          'item_id',
          itemCode,
          `Duplicate item code — also on row ${previous}`,
          'Give each item a unique code, or leave the cell empty to create a new item',
        );
      } else {
        seenCodes.set(itemCode, rowNumber);
      }
    }

    // Only issues that make the row unimportable invalidate it.
    const blocking = rowIssues.filter((issue) => issue.severity === 'error');

    rows.push({
      rowNumber,
      valid: blocking.length === 0,
      itemCode,
      categoryAr,
      categoryEn: get('category_en').trim() || null,
      subcategoryAr: get('subcategory_ar').trim() || null,
      subcategoryEn: get('subcategory_en').trim() || null,
      nameAr,
      nameEn: get('item_name_en').trim() || null,
      descriptionAr: get('description_ar').trim() || null,
      descriptionEn: get('description_en').trim() || null,
      priceMinor,
      costMinor,
      calories,
      servingSize: get('serving_size').trim() || null,
      ingredientsAr: get('ingredients_ar').trim() || null,
      ingredientsEn: get('ingredients_en').trim() || null,
      allergens,
      tags: splitList(get('tags')),
      imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : null,
      featured: parseBoolean(get('featured'), false),
      availability,
      sortOrder,
      menuKey: get('menu').trim().toLowerCase() || null,
      branchKey: get('branch').trim().toLowerCase() || null,
      issues: rowIssues,
    });
  });

  return {
    rows,
    issues,
    validCount: rows.filter((row) => row.valid).length,
    invalidCount: rows.filter((row) => !row.valid).length,
    duplicateCodes: [...new Set(duplicateCodes)],
    missingRequiredColumns,
  };
}

function parseAllergens(raw: string): {
  allergens: string[];
  unknown: string[];
} {
  const parts = splitList(raw);
  const allergens: string[] = [];
  const unknown: string[] = [];

  for (const part of parts) {
    const normalized = part.toLowerCase();
    const known =
      (KNOWN_ALLERGENS as readonly string[]).includes(normalized)
        ? normalized
        : (ALLERGEN_ALIASES[normalized] ?? ALLERGEN_ALIASES[part]);

    if (known) {
      if (!allergens.includes(known)) allergens.push(known);
    } else {
      unknown.push(part);
    }
  }

  return { allergens, unknown };
}

function splitList(raw: string): string[] {
  return raw
    // Arabic comma is as common as the Latin one in these files.
    .split(/[,،;]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function parseBoolean(raw: string, fallback: boolean): boolean {
  const value = raw.trim().toLowerCase();
  if (value === '') return fallback;
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  return fallback;
}
