import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import {
  TenantAccessError,
  requireTenantContext,
  tenantScope,
  type AuthenticatedUser,
  type TenantContext,
} from '@/server/tenancy/context';
import type { ValidatedRow } from './validate';

/**
 * Import execution (master spec §64, §65, §66, §75, §76, §77).
 *
 * Three properties this is built around:
 *
 *  1. **Partial import.** Valid rows land even when others fail (§64). A menu
 *     update must not be blocked by one unreadable price.
 *  2. **Update, don't duplicate.** Rows are matched on the business-scoped
 *     item code, so export → edit → re-import updates in place (§66).
 *  3. **Rollback.** Every touched row's prior state is recorded before it is
 *     changed, which is what makes a bulk price update reversible (§76).
 */

export interface ImportOptions {
  fileName: string;
  /** Menu that rows without an explicit `menu` column belong to. */
  defaultMenuKey: string;
  mapping: Record<number, string>;
  /** What to do when a row matches an existing item (§65). */
  duplicateStrategy: 'update' | 'skip';
  rows: ValidatedRow[];
}

export interface ImportResult {
  batchId: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

/** Snapshot of the fields an import can change, used to undo one (§126). */
interface ItemSnapshot {
  categoryId: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  priceMinor: number | null;
  calories: number | null;
  servingSizeAr: string | null;
  ingredientsAr: string | null;
  ingredientsEn: string | null;
  allergens: string[];
  tags: string[];
  availability: string;
  isFeatured: boolean;
  sortOrder: number;
}

export async function executeImport(
  user: AuthenticatedUser,
  businessId: string,
  options: ImportOptions,
): Promise<ImportResult> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: context.businessId },
    select: { currency: true, publicId: true },
  });

  const batch = await prisma.importBatch.create({
    data: {
      businessId: context.businessId,
      userId: user.id,
      fileName: options.fileName,
      mapping: options.mapping as object,
      totalRows: options.rows.length,
    },
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of options.rows) {
    if (!row.valid) {
      errors += 1;
      await recordRow(batch.id, row, 'ERROR');
      continue;
    }

    try {
      const outcome = await importRow(context, business.currency, batch.id, options, row, user.id);

      if (outcome === 'CREATED') created += 1;
      else if (outcome === 'UPDATED') updated += 1;
      else skipped += 1;
    } catch (error) {
      // One bad row must not abandon the rest of the file (§64).
      errors += 1;
      await recordRow(batch.id, row, 'ERROR', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      createdRows: created,
      updatedRows: updated,
      skippedRows: skipped,
      errorRows: errors,
    },
  });

  await recordAudit({
    action: 'import.executed',
    entity: 'import_batch',
    entityId: batch.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { fileName: options.fileName, created, updated, skipped, errors },
  });

  return { batchId: batch.id, created, updated, skipped, errors };
}

async function importRow(
  context: TenantContext,
  currency: string,
  batchId: string,
  options: ImportOptions,
  row: ValidatedRow,
  userId: string,
): Promise<'CREATED' | 'UPDATED' | 'SKIPPED'> {
  const menuKey = row.menuKey ?? options.defaultMenuKey;

  const menu = await prisma.menu.findFirst({
    where: { key: menuKey, ...tenantScope(context) },
    select: { id: true },
  });

  if (!menu) throw new Error(`Unknown menu: ${menuKey}`);

  // Categories are created on demand from the spreadsheet, which is how a
  // restaurant's own file imports without pre-registering its sections (§62).
  const categoryKey = slugifyCategory(row.categoryAr, row.categoryEn);

  const category = await prisma.menuCategory.upsert({
    where: { menuId_key: { menuId: menu.id, key: categoryKey } },
    update: {},
    create: {
      menuId: menu.id,
      businessId: context.businessId,
      key: categoryKey,
      nameAr: row.categoryAr,
      nameEn: row.categoryEn,
    },
    select: { id: true },
  });

  const itemCode = row.itemCode ?? deriveItemCode(categoryKey, row.nameAr, row.rowNumber);

  const existing = await prisma.menuItem.findUnique({
    where: { businessId_itemCode: { businessId: context.businessId, itemCode } },
    select: {
      id: true,
      categoryId: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      descriptionEn: true,
      priceMinor: true,
      calories: true,
      servingSizeAr: true,
      ingredientsAr: true,
      ingredientsEn: true,
      allergens: true,
      tags: true,
      availability: true,
      isFeatured: true,
      sortOrder: true,
    },
  });

  if (existing && options.duplicateStrategy === 'skip') {
    await recordRow(batchId, row, 'SKIPPED', { itemCode });
    return 'SKIPPED';
  }

  const data = {
    categoryId: category.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    priceMinor: row.priceMinor,
    currency,
    // Never inferred: an empty cell leaves the field empty (§37; GOALS I9).
    calories: row.calories,
    servingSizeAr: row.servingSize,
    ingredientsAr: row.ingredientsAr,
    ingredientsEn: row.ingredientsEn,
    allergens: row.allergens,
    tags: row.tags,
    availability: row.availability,
    isFeatured: row.featured,
    sortOrder: row.sortOrder,
  } as const;

  const item = await prisma.menuItem.upsert({
    where: { businessId_itemCode: { businessId: context.businessId, itemCode } },
    update: data,
    create: { ...data, businessId: context.businessId, itemCode },
  });

  // Price history is written for every change, whatever caused it (§77, §124).
  if (existing && existing.priceMinor !== row.priceMinor) {
    await prisma.priceHistory.create({
      data: {
        businessId: context.businessId,
        itemId: item.id,
        itemCode,
        oldPriceMinor: existing.priceMinor,
        newPriceMinor: row.priceMinor,
        currency,
        changedById: userId,
        batchId,
      },
    });
  }

  if (row.branchKey) {
    await applyBranchOverride(context, row.branchKey, item.id, row.priceMinor);
  }

  await recordRow(batchId, row, existing ? 'UPDATED' : 'CREATED', {
    itemCode,
    beforeState: existing ? toSnapshot(existing) : null,
    afterState: { ...data, itemCode },
  });

  return existing ? 'UPDATED' : 'CREATED';
}

/**
 * A row naming a branch sets that branch's override rather than the shared
 * price, which is how one file can carry per-branch pricing (§73, §86).
 */
async function applyBranchOverride(
  context: TenantContext,
  branchKey: string,
  itemId: string,
  priceMinor: number | null,
) {
  const branch = await prisma.branch.findFirst({
    where: { key: branchKey, ...tenantScope(context) },
    select: { id: true },
  });

  if (!branch) throw new Error(`Unknown branch: ${branchKey}`);

  await prisma.branchItemOverride.upsert({
    where: { branchId_itemId: { branchId: branch.id, itemId } },
    update: { priceMinor },
    create: { branchId: branch.id, itemId, priceMinor },
  });
}

async function recordRow(
  batchId: string,
  row: ValidatedRow,
  outcome: 'CREATED' | 'UPDATED' | 'SKIPPED' | 'ERROR',
  extra: {
    itemCode?: string;
    beforeState?: ItemSnapshot | null;
    afterState?: object | null;
    errorMessage?: string;
  } = {},
) {
  const firstIssue = row.issues[0];

  await prisma.importRow.create({
    data: {
      batchId,
      rowNumber: row.rowNumber,
      itemCode: extra.itemCode ?? row.itemCode,
      outcome,
      errorColumn: outcome === 'ERROR' ? (firstIssue?.column ?? null) : null,
      errorValue: outcome === 'ERROR' ? (firstIssue?.value ?? null) : null,
      errorMessage:
        outcome === 'ERROR' ? (extra.errorMessage ?? firstIssue?.problem ?? null) : null,
      beforeState: (extra.beforeState ?? undefined) as object | undefined,
      afterState: (extra.afterState ?? undefined) as object | undefined,
    },
  });
}

function toSnapshot(item: ItemSnapshot & { id: string }): ItemSnapshot {
  return {
    categoryId: item.categoryId,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    descriptionAr: item.descriptionAr,
    descriptionEn: item.descriptionEn,
    priceMinor: item.priceMinor,
    calories: item.calories,
    servingSizeAr: item.servingSizeAr,
    ingredientsAr: item.ingredientsAr,
    ingredientsEn: item.ingredientsEn,
    allergens: item.allergens,
    tags: item.tags,
    availability: item.availability,
    isFeatured: item.isFeatured,
    sortOrder: item.sortOrder,
  };
}

/**
 * Rolls a batch back (master spec §76, §126).
 *
 * Updated rows are restored to their recorded prior state; rows the batch
 * created are removed. Restoration is one transaction, so a partially undone
 * batch is not a state the system can be left in.
 *
 * A batch can be rolled back once: doing it twice would restore stale values
 * over whatever legitimately happened since.
 */
export async function rollbackImport(
  user: AuthenticatedUser,
  businessId: string,
  batchId: string,
) {
  const context = await requireTenantContext(user, businessId, 'MANAGER');

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, ...tenantScope(context) },
    include: { rows: { where: { outcome: { in: ['CREATED', 'UPDATED'] } } } },
  });

  if (!batch) throw new TenantAccessError('Import batch not found');

  if (batch.status === 'ROLLED_BACK') {
    throw new Error('This import has already been rolled back');
  }

  let restored = 0;
  let removed = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of batch.rows) {
      if (!row.itemCode) continue;

      if (row.outcome === 'CREATED') {
        const result = await tx.menuItem.deleteMany({
          where: { businessId: context.businessId, itemCode: row.itemCode },
        });
        removed += result.count;
        continue;
      }

      const before = row.beforeState as ItemSnapshot | null;
      if (!before) continue;

      const result = await tx.menuItem.updateMany({
        where: { businessId: context.businessId, itemCode: row.itemCode },
        data: {
          categoryId: before.categoryId,
          nameAr: before.nameAr,
          nameEn: before.nameEn,
          descriptionAr: before.descriptionAr,
          descriptionEn: before.descriptionEn,
          priceMinor: before.priceMinor,
          calories: before.calories,
          servingSizeAr: before.servingSizeAr,
          ingredientsAr: before.ingredientsAr,
          ingredientsEn: before.ingredientsEn,
          allergens: before.allergens,
          tags: before.tags,
          availability: before.availability as 'AVAILABLE',
          isFeatured: before.isFeatured,
          sortOrder: before.sortOrder,
        },
      });

      restored += result.count;
    }

    await tx.importBatch.update({
      where: { id: batch.id },
      data: { status: 'ROLLED_BACK', rolledBackAt: new Date() },
    });
  });

  await recordAudit({
    action: 'import.rolled_back',
    entity: 'import_batch',
    entityId: batch.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { restored, removed },
  });

  return { restored, removed };
}

/** Stable, readable category key derived from the authored name. */
function slugifyCategory(nameAr: string, nameEn: string | null): string {
  const source = (nameEn ?? nameAr).trim();

  const slug = source
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  // Arabic-only names slugify to Arabic characters, which are not valid path
  // segments; fall back to a stable hash of the name instead.
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) ? slug : `cat-${hashKey(nameAr)}`;
}

/**
 * Item code for a row that did not supply one. Derived from stable inputs so
 * re-importing the same file updates rather than duplicating (§65).
 */
function deriveItemCode(categoryKey: string, nameAr: string, rowNumber: number): string {
  return `${categoryKey.slice(0, 12).toUpperCase()}-${hashKey(`${nameAr}:${rowNumber}`)}`;
}

function hashKey(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36).toUpperCase().slice(0, 8);
}
