/**
 * Nutrition and compliance readiness (master spec §05, §105, §106, §107).
 *
 * The distinction this module exists to hold is stated plainly in the spec and
 * is the whole design:
 *
 *   **"Data missing" is not "the business is non-compliant",
 *    and "data complete" is not "the business is compliant."**
 *
 * So nothing here returns a compliance verdict. It reports which fields the
 * business has supplied and which it has not, and that is all. A regulatory
 * judgement depends on the menu, the premises and an inspector — none of which
 * this platform can see — and a system that implied otherwise would be selling
 * a legal assurance it cannot honour.
 *
 * Two further rules:
 *  - **Never fabricate.** No value is estimated, derived or defaulted. A
 *    calorie-burn statement in particular is authored by the business, because
 *    the figure depends on the person reading it.
 *  - **Absent is not zero.** Every field is nullable, and "0 g of sugar" and
 *    "sugar not stated" are different answers that must never be conflated.
 */

export type FieldStatus = 'PROVIDED' | 'MISSING';

export interface NutritionFields {
  calories: number | null;
  caffeineMg: number | null;
  sodiumMg: number | null;
  proteinDeci: number | null;
  carbsDeci: number | null;
  fatDeci: number | null;
  fibreDeci: number | null;
  sugarDeci: number | null;
  servingSizeAr: string | null;
  servingSizeEn: string | null;
  allergens: string[];
  highSalt: boolean;
  activityNoteAr: string | null;
  activityNoteEn: string | null;
}

/** What the platform asks a food business for, and why each one is here. */
export const NUTRITION_FIELDS = [
  { key: 'calories', label: 'Calories', core: true },
  { key: 'servingSize', label: 'Serving size', core: true },
  { key: 'allergens', label: 'Allergens', core: true },
  { key: 'sodiumMg', label: 'Sodium', core: false },
  { key: 'caffeineMg', label: 'Caffeine', core: false },
  { key: 'proteinDeci', label: 'Protein', core: false },
  { key: 'carbsDeci', label: 'Carbohydrates', core: false },
  { key: 'fatDeci', label: 'Fat', core: false },
  { key: 'fibreDeci', label: 'Fibre', core: false },
  { key: 'sugarDeci', label: 'Sugar', core: false },
  { key: 'activityNote', label: 'Physical activity note', core: false },
] as const;

export type NutritionFieldKey = (typeof NUTRITION_FIELDS)[number]['key'];

/** Per-item completeness (§106). */
export type ItemNutritionState = 'COMPLETE' | 'PARTIAL' | 'MISSING';

export interface ItemNutritionReport {
  state: ItemNutritionState;
  provided: NutritionFieldKey[];
  missing: NutritionFieldKey[];
  /** Core fields still absent — what a "show me items missing calories" filter uses. */
  missingCore: NutritionFieldKey[];
}

function isProvided(fields: NutritionFields, key: NutritionFieldKey): boolean {
  switch (key) {
    case 'servingSize':
      return Boolean(fields.servingSizeAr || fields.servingSizeEn);
    case 'allergens':
      // An explicitly empty list is a statement only if the business made it;
      // an absent list and "no allergens" are indistinguishable here, so this
      // counts only a non-empty declaration. Reporting it as missing is the
      // conservative direction: it prompts a person to check.
      return fields.allergens.length > 0;
    case 'activityNote':
      return Boolean(fields.activityNoteAr || fields.activityNoteEn);
    default:
      return fields[key] !== null && fields[key] !== undefined;
  }
}

export function reportItem(fields: NutritionFields): ItemNutritionReport {
  const provided: NutritionFieldKey[] = [];
  const missing: NutritionFieldKey[] = [];
  const missingCore: NutritionFieldKey[] = [];

  for (const field of NUTRITION_FIELDS) {
    if (isProvided(fields, field.key)) {
      provided.push(field.key);
    } else {
      missing.push(field.key);
      if (field.core) missingCore.push(field.key);
    }
  }

  const state: ItemNutritionState =
    provided.length === 0 ? 'MISSING' : missing.length === 0 ? 'COMPLETE' : 'PARTIAL';

  return { state, provided, missing, missingCore };
}

/* -------------------------------------------------------------------------- */
/* Business-level readiness                                                   */
/* -------------------------------------------------------------------------- */

export interface ReadinessReport {
  /** Deliberately named for what it measures: supplied data, not compliance. */
  itemsTotal: number;
  itemsComplete: number;
  itemsPartial: number;
  itemsMissing: number;
  /** Per field, how many items have supplied it. */
  coverage: { key: NutritionFieldKey; label: string; provided: number; core: boolean }[];
  /** Items a person should look at, capped for display. */
  needsReview: { itemCode: string; name: string; missingCore: NutritionFieldKey[] }[];
  /**
   * A single word for the whole business, and one the spec allows:
   * complete, partial, missing, or needs review. Never "compliant".
   */
  overall: 'COMPLETE' | 'PARTIAL' | 'MISSING' | 'NEEDS_REVIEW';
}

export function reportBusiness(
  items: readonly (NutritionFields & { itemCode: string; name: string })[],
): ReadinessReport {
  const coverage = NUTRITION_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    core: field.core,
    provided: 0,
  }));

  let complete = 0;
  let partial = 0;
  let missing = 0;
  const needsReview: ReadinessReport['needsReview'] = [];

  for (const item of items) {
    const report = reportItem(item);

    for (const key of report.provided) {
      const entry = coverage.find((field) => field.key === key);
      if (entry) entry.provided += 1;
    }

    if (report.state === 'COMPLETE') complete += 1;
    else if (report.state === 'PARTIAL') partial += 1;
    else missing += 1;

    if (report.missingCore.length > 0 && needsReview.length < 50) {
      needsReview.push({
        itemCode: item.itemCode,
        name: item.name,
        missingCore: report.missingCore,
      });
    }
  }

  const overall: ReadinessReport['overall'] =
    items.length === 0
      ? 'MISSING'
      : complete === items.length
        ? 'COMPLETE'
        : needsReview.length > 0
          ? 'NEEDS_REVIEW'
          : missing === items.length
            ? 'MISSING'
            : 'PARTIAL';

  return {
    itemsTotal: items.length,
    itemsComplete: complete,
    itemsPartial: partial,
    itemsMissing: missing,
    coverage,
    needsReview,
    overall,
  };
}

/**
 * The sentence shown beside the report.
 *
 * Written out here rather than assembled in a template, because the wording is
 * the feature: it must never be edited into a compliance claim by accident.
 */
export const READINESS_DISCLAIMER =
  'This reports which information the business has supplied. It is not a regulatory assessment, and it does not state whether the business meets any requirement.';

/** Formats a stored tenth-of-a-gram as grams, or nothing at all. */
export function formatGrams(deci: number | null): string | null {
  if (deci === null || deci === undefined) return null;
  return `${(deci / 10).toFixed(1).replace(/\.0$/, '')} g`;
}
