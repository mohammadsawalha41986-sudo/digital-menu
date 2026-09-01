import type { ValidatedRow } from './validate';

/**
 * The import plan: what an upload will *do*, computed before anything is
 * written (master spec §15, §16, §21, §22).
 *
 * The importer was already correct — it validated, it imported partially, it
 * rolled back. What it could not do was answer the question an operator asks
 * before pressing Import: *what is about to change?* The preview showed valid
 * and invalid row counts and a sample of rows, which says whether the file
 * parses, not whether the import is a good idea.
 *
 * So this classifies every row against what already exists, and reports it in
 * the terms the spec asks for: `120 New / 83 Updated / 14 Unchanged / 6 Errors`,
 * with `38 SAR → 42 SAR` for each price that moves.
 *
 * Pure, and deliberately so: the caller supplies the existing items, which
 * keeps the whole thing testable without a database and means the same
 * function serves the preview screen and the conflict centre.
 */

export type RowOutcome = 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'ERROR';

/** An item as it currently stands, in the fields an import can touch. */
export interface ExistingItem {
  itemCode: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  priceMinor: number | null;
  calories: number | null;
  categoryKey: string;
  categoryNameAr: string;
  availability: string;
  isFeatured: boolean;
}

export interface FieldDelta {
  field: string;
  from: string | null;
  to: string | null;
}

export interface PlannedRow {
  rowNumber: number;
  outcome: RowOutcome;
  itemCode: string | null;
  nameAr: string;
  nameEn: string | null;
  categoryAr: string;
  /** Populated for UPDATE rows: exactly what moves, and from what. */
  changes: FieldDelta[];
  /** Populated for a price move specifically, so the UI can lead with it. */
  priceChange: { from: number | null; to: number | null } | null;
  /** Why this row cannot be imported. Empty unless the outcome is ERROR. */
  problems: string[];
}

export interface ConflictKind {
  kind: 'duplicate_in_file' | 'category_new' | 'category_renamed' | 'code_missing';
  /** What the conflict is about, in the operator's words. */
  subject: string;
  detail: string;
  rowNumbers: number[];
}

export interface ImportPlan {
  rows: PlannedRow[];
  counts: { create: number; update: number; unchanged: number; error: number };
  priceChanges: PlannedRow[];
  conflicts: ConflictKind[];
  /** Categories the file introduces that do not exist yet. */
  newCategories: string[];
}

function normalise(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function delta(field: string, from: unknown, to: unknown): FieldDelta | null {
  const a = from === null || from === undefined ? null : String(from);
  const b = to === null || to === undefined ? null : String(to);
  return a === b ? null : { field, from: a, to: b };
}

/**
 * Builds the plan.
 *
 * Matching is by `itemCode`, the identifier that already survives the export →
 * edit → import round trip. A row with no code is a new item by definition;
 * matching such a row on name would silently overwrite a different dish that
 * happens to share one.
 */
export function planImport(
  rows: readonly ValidatedRow[],
  existing: readonly ExistingItem[],
  options: { issuesByRow?: Map<number, string[]> } = {},
): ImportPlan {
  const byCode = new Map(existing.map((item) => [item.itemCode, item]));
  const existingCategories = new Set(existing.map((item) => item.categoryNameAr.trim()));

  const planned: PlannedRow[] = [];
  const seenCodes = new Map<string, number[]>();
  const newCategories = new Set<string>();

  for (const row of rows) {
    const problems = options.issuesByRow?.get(row.rowNumber) ?? [];

    if (row.itemCode) {
      seenCodes.set(row.itemCode, [...(seenCodes.get(row.itemCode) ?? []), row.rowNumber]);
    }

    if (row.categoryAr && !existingCategories.has(row.categoryAr.trim())) {
      newCategories.add(row.categoryAr.trim());
    }

    if (!row.valid || problems.length > 0) {
      planned.push({
        rowNumber: row.rowNumber,
        outcome: 'ERROR',
        itemCode: row.itemCode,
        nameAr: row.nameAr,
        nameEn: row.nameEn,
        categoryAr: row.categoryAr,
        changes: [],
        priceChange: null,
        problems: problems.length > 0 ? problems : ['This row could not be read'],
      });
      continue;
    }

    const current = row.itemCode ? byCode.get(row.itemCode) : undefined;

    if (!current) {
      planned.push({
        rowNumber: row.rowNumber,
        outcome: 'CREATE',
        itemCode: row.itemCode,
        nameAr: row.nameAr,
        nameEn: row.nameEn,
        categoryAr: row.categoryAr,
        changes: [],
        priceChange: null,
        problems: [],
      });
      continue;
    }

    const changes = [
      delta('Arabic name', current.nameAr, row.nameAr),
      delta('English name', normalise(current.nameEn), normalise(row.nameEn)),
      delta('Price', current.priceMinor, row.priceMinor),
      delta('Calories', current.calories, row.calories),
      delta('Arabic description', normalise(current.descriptionAr), normalise(row.descriptionAr)),
      delta('English description', normalise(current.descriptionEn), normalise(row.descriptionEn)),
      delta('Category', current.categoryNameAr, row.categoryAr),
      delta('Availability', current.availability, row.availability),
      delta('Featured', current.isFeatured, row.featured),
    ].filter((change): change is FieldDelta => change !== null);

    const price = changes.find((change) => change.field === 'Price');

    planned.push({
      rowNumber: row.rowNumber,
      outcome: changes.length === 0 ? 'UNCHANGED' : 'UPDATE',
      itemCode: row.itemCode,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      categoryAr: row.categoryAr,
      changes,
      priceChange: price
        ? {
            from: current.priceMinor,
            to: row.priceMinor,
          }
        : null,
      problems: [],
    });
  }

  const conflicts: ConflictKind[] = [];

  for (const [code, rowNumbers] of seenCodes) {
    if (rowNumbers.length > 1) {
      conflicts.push({
        kind: 'duplicate_in_file',
        subject: code,
        detail: `The same item code appears on ${rowNumbers.length} rows. The last one would win.`,
        rowNumbers,
      });
    }
  }

  for (const category of newCategories) {
    conflicts.push({
      kind: 'category_new',
      subject: category,
      detail: 'This category does not exist yet and will be created.',
      rowNumbers: planned
        .filter((row) => row.categoryAr.trim() === category)
        .map((row) => row.rowNumber),
    });
  }

  const codeless = planned.filter((row) => row.outcome === 'CREATE' && !row.itemCode);
  if (codeless.length > 0) {
    conflicts.push({
      kind: 'code_missing',
      subject: `${codeless.length} row${codeless.length === 1 ? '' : 's'}`,
      detail:
        'No item code, so these are treated as new items. If they are meant to update existing ones, export first and keep the codes.',
      rowNumbers: codeless.map((row) => row.rowNumber),
    });
  }

  const counts = {
    create: planned.filter((row) => row.outcome === 'CREATE').length,
    update: planned.filter((row) => row.outcome === 'UPDATE').length,
    unchanged: planned.filter((row) => row.outcome === 'UNCHANGED').length,
    error: planned.filter((row) => row.outcome === 'ERROR').length,
  };

  return {
    rows: planned,
    counts,
    priceChanges: planned.filter((row) => row.priceChange !== null),
    conflicts,
    newCategories: [...newCategories],
  };
}
