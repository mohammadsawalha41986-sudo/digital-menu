'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { invalidateProfile } from '@/server/profile/cache';
import { TenantAccessError } from '@/server/tenancy/context';
import { ParseError, parseSpreadsheet } from '@/server/import/parse';
import { validateRows } from '@/server/import/validate';
import { planImport, type ExistingItem } from '@/server/import/plan';
import { IMPORT_COLUMNS } from '@/server/import/columns';
import { executeImport, rollbackImport } from '@/server/import/execute';
import { prisma } from '@/server/db/client';
import type { ActionState } from './actions';

/**
 * Import actions.
 *
 * The wizard is two steps — preview, then confirm — because the spec is
 * explicit that nothing may be written before an operator has seen what will
 * happen (§61). The preview action performs no writes at all.
 */

export interface ImportPreviewState extends ActionState {
  preview?: {
    fileName: string;
    headers: string[];
    mapping: Record<number, string>;
    missingRequiredColumns: string[];
    validCount: number;
    invalidCount: number;
    duplicateCodes: string[];
    /** First rows, for the preview table. */
    sample: {
      rowNumber: number;
      valid: boolean;
      category: string;
      name: string;
      price: string;
      calories: string;
      problem: string | null;
    }[];
    issues: {
      rowNumber: number;
      column: string;
      value: string;
      problem: string;
      suggestion: string;
    }[];
    /**
     * What the import will *do*, not merely whether the file parses (§15).
     * Counts, the price moves in full, and the conflicts worth resolving
     * before pressing the button.
     */
    plan: {
      counts: { create: number; update: number; unchanged: number; error: number };
      priceChanges: {
        rowNumber: number;
        name: string;
        from: string;
        to: string;
      }[];
      updates: { rowNumber: number; name: string; changes: string[] }[];
      conflicts: { kind: string; subject: string; detail: string; rows: number[] }[];
      newCategories: string[];
    };
    /** Every column the importer understands, so the mapping can be corrected. */
    availableColumns: { key: string; label: string; required: boolean }[];
    /** Encoded rows, handed back on confirmation so the file is parsed once. */
    payload: string;
  };
}

const MAX_PREVIEW_ROWS = 25;

export async function previewImportAction(
  businessId: string,
  _previous: ImportPreviewState,
  formData: FormData,
): Promise<ImportPreviewState> {
  const user = await requireUser();

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose an .xlsx or .csv file' };
  }

  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      OR: [
        { memberships: { some: { userId: user.id } } },
        ...(user.role === 'SUPER_ADMIN' ? [{}] : []),
      ],
    },
    select: { currency: true },
  });

  if (!business) return { error: 'Not found or access denied' };

  try {
    const parsed = await parseSpreadsheet(new Uint8Array(await file.arrayBuffer()), file.name);

    // A corrected mapping arrives as `map_<index>` fields, so re-previewing
    // after a fix re-reads the same file through the operator's choices
    // rather than through the guess (§14).
    const overrides: Record<number, string> = {};
    for (const [name, value] of formData.entries()) {
      const match = /^map_(\d+)$/.exec(name);
      if (match && typeof value === 'string' && value) {
        overrides[Number(match[1])] = value;
      }
    }

    const mapping =
      Object.keys(overrides).length > 0
        ? { ...parsed.suggestedMapping, ...overrides }
        : parsed.suggestedMapping;

    const validation = validateRows({
      currency: business.currency,
      mapping,
      rows: parsed.rows,
      rowNumbers: parsed.rowNumbers,
    });

    // Existing items, read once, so the plan can say new versus updated.
    const existingRows = await prisma.menuItem.findMany({
      where: { businessId },
      select: {
        itemCode: true,
        nameAr: true,
        nameEn: true,
        descriptionAr: true,
        descriptionEn: true,
        priceMinor: true,
        calories: true,
        availability: true,
        isFeatured: true,
        category: { select: { key: true, nameAr: true } },
      },
    });

    const existing: ExistingItem[] = existingRows.map((item) => ({
      itemCode: item.itemCode,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      descriptionAr: item.descriptionAr,
      descriptionEn: item.descriptionEn,
      priceMinor: item.priceMinor,
      calories: item.calories,
      availability: item.availability,
      isFeatured: item.isFeatured,
      categoryKey: item.category.key,
      categoryNameAr: item.category.nameAr,
    }));

    const issuesByRow = new Map<number, string[]>();
    for (const issue of validation.issues) {
      issuesByRow.set(issue.rowNumber, [
        ...(issuesByRow.get(issue.rowNumber) ?? []),
        `${issue.column}: ${issue.problem}`,
      ]);
    }

    const plan = planImport(validation.rows, existing, { issuesByRow });

    const money = (minor: number | null) =>
      minor === null ? '—' : (minor / 100).toFixed(2);

    return {
      ok: true,
      message:
        validation.missingRequiredColumns.length > 0
          ? 'Required columns are missing — nothing can be imported yet'
          : `${validation.validCount} rows ready, ${validation.invalidCount} with problems`,
      preview: {
        fileName: file.name,
        headers: parsed.headers,
        mapping,
        missingRequiredColumns: validation.missingRequiredColumns,
        validCount: validation.validCount,
        invalidCount: validation.invalidCount,
        duplicateCodes: validation.duplicateCodes,
        sample: validation.rows.slice(0, MAX_PREVIEW_ROWS).map((row) => ({
          rowNumber: row.rowNumber,
          valid: row.valid,
          category: row.categoryAr,
          name: row.nameAr,
          price: row.priceMinor === null ? '' : String(row.priceMinor / 100),
          calories: row.calories === null ? '' : String(row.calories),
          problem: row.issues[0]?.problem ?? null,
        })),
        issues: validation.issues.slice(0, 100),
        plan: {
          counts: plan.counts,
          priceChanges: plan.priceChanges.slice(0, 200).map((row) => ({
            rowNumber: row.rowNumber,
            name: row.nameEn ?? row.nameAr,
            from: money(row.priceChange?.from ?? null),
            to: money(row.priceChange?.to ?? null),
          })),
          updates: plan.rows
            .filter((row) => row.outcome === 'UPDATE')
            .slice(0, 200)
            .map((row) => ({
              rowNumber: row.rowNumber,
              name: row.nameEn ?? row.nameAr,
              changes: row.changes.map((change) => change.field),
            })),
          conflicts: plan.conflicts.map((conflict) => ({
            kind: conflict.kind,
            subject: conflict.subject,
            detail: conflict.detail,
            rows: conflict.rowNumbers.slice(0, 20),
          })),
          newCategories: plan.newCategories,
        },
        availableColumns: IMPORT_COLUMNS.map((column) => ({
          key: column.key,
          label: column.labelEn,
          required: column.required ?? false,
        })),
        payload: Buffer.from(JSON.stringify(validation.rows)).toString('base64'),
      },
    };
  } catch (error) {
    if (error instanceof ParseError) return { error: error.message };
    throw error;
  }
}

export async function confirmImportAction(
  businessId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const payload = formData.get('payload');
  const fileName = String(formData.get('fileName') ?? 'import.xlsx');
  const defaultMenuKey = String(formData.get('menuKey') ?? 'main');
  const duplicateStrategy = formData.get('duplicateStrategy') === 'skip' ? 'skip' : 'update';

  if (typeof payload !== 'string' || payload === '') {
    return { error: 'Preview the file before importing' };
  }

  try {
    const rows = JSON.parse(Buffer.from(payload, 'base64').toString());

    const result = await executeImport(user, businessId, {
      fileName,
      defaultMenuKey,
      mapping: {},
      duplicateStrategy,
      rows,
    });

    revalidatePath(`/admin/businesses/${businessId}/data`);
    revalidatePath(`/admin/businesses/${businessId}/menus`);
    revalidatePath(`/m/${publicId}`);
    invalidateProfile(publicId);

    return {
      ok: true,
      message: `Imported: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors. The QR is unchanged.`,
    };
  } catch (error) {
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}

export async function rollbackImportAction(
  businessId: string,
  batchId: string,
  publicId: string,
): Promise<ActionState> {
  const user = await requireUser();

  try {
    const result = await rollbackImport(user, businessId, batchId);

    revalidatePath(`/admin/businesses/${businessId}/data`);
    revalidatePath(`/admin/businesses/${businessId}/menus`);
    revalidatePath(`/m/${publicId}`);
    invalidateProfile(publicId);

    return {
      ok: true,
      message: `Rolled back: ${result.restored} items restored, ${result.removed} removed.`,
    };
  } catch (error) {
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    return { error: error instanceof Error ? error.message : 'Rollback failed' };
  }
}
