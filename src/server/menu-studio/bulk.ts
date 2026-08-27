import { prisma } from '@/server/db/client';
import { requireTenantContext, tenantScope, type AuthenticatedUser } from '@/server/tenancy/context';
import { recordAudit } from '@/server/audit/log';

/**
 * Bulk edits (Menu Studio §27).
 *
 * Three properties every operation here keeps:
 *
 *  1. **Scoped.** Item codes are matched inside the tenant scope, so a code
 *     belonging to another business simply matches nothing.
 *  2. **Reported.** Every call returns how many rows it actually changed, and
 *     which codes it could not find. A bulk tool that says "done" while
 *     silently skipping half its input is how a menu quietly goes wrong.
 *  3. **Auditable.** Price changes go through price history like every other
 *     price change, so "who put it up to 45?" has an answer (§77, §124).
 */

export interface BulkResult {
  changed: number;
  /** Codes that matched nothing in this business. */
  missing: string[];
}

export type BulkChange =
  | { kind: 'category'; categoryKey: string }
  | { kind: 'availability'; availability: 'AVAILABLE' | 'UNAVAILABLE' | 'HIDDEN' }
  | { kind: 'featured'; featured: boolean }
  | { kind: 'tags'; add?: string[]; remove?: string[] }
  | { kind: 'price'; mode: 'set' | 'adjust-percent'; value: number }
  | { kind: 'delete' };

async function resolveItems(businessId: string, itemCodes: string[]) {
  const items = await prisma.menuItem.findMany({
    where: { businessId, itemCode: { in: itemCodes } },
    select: { id: true, itemCode: true, priceMinor: true, currency: true, tags: true },
  });

  const found = new Set(items.map((item) => item.itemCode));

  return { items, missing: itemCodes.filter((code) => !found.has(code)) };
}

export async function bulkEditItems(
  user: AuthenticatedUser,
  businessId: string,
  itemCodes: string[],
  change: BulkChange,
): Promise<BulkResult> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const codes = [...new Set(itemCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
  if (codes.length === 0) throw new Error('Select at least one item.');

  const { items, missing } = await resolveItems(context.businessId, codes);
  if (items.length === 0) return { changed: 0, missing };

  const ids = items.map((item) => item.id);
  let changed = 0;

  switch (change.kind) {
    case 'category': {
      // The destination is resolved in the tenant scope too: moving items into
      // another business's category must be impossible, not merely unlikely.
      const category = await prisma.menuCategory.findFirst({
        where: { key: change.categoryKey, ...tenantScope(context) },
        select: { id: true },
      });

      if (!category) throw new Error('That category does not exist.');

      ({ count: changed } = await prisma.menuItem.updateMany({
        where: { id: { in: ids }, ...tenantScope(context) },
        data: { categoryId: category.id },
      }));
      break;
    }

    case 'availability':
      ({ count: changed } = await prisma.menuItem.updateMany({
        where: { id: { in: ids }, ...tenantScope(context) },
        data: { availability: change.availability },
      }));
      break;

    case 'featured':
      ({ count: changed } = await prisma.menuItem.updateMany({
        where: { id: { in: ids }, ...tenantScope(context) },
        data: { isFeatured: change.featured },
      }));
      break;

    case 'tags': {
      // Tags are per-item sets, so this is a read-modify-write rather than one
      // statement. Done in a transaction so a partial application cannot
      // survive a failure halfway through.
      const add = (change.add ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
      const remove = new Set(
        (change.remove ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      );

      await prisma.$transaction(
        items.map((item) => {
          const next = [...new Set([...item.tags, ...add])].filter((tag) => !remove.has(tag));

          return prisma.menuItem.update({ where: { id: item.id }, data: { tags: next } });
        }),
      );

      changed = items.length;
      break;
    }

    case 'price': {
      const updates = items.map((item) => {
        const next =
          change.mode === 'set'
            ? Math.round(change.value)
            : item.priceMinor === null
              ? null
              : Math.round(item.priceMinor * (1 + change.value / 100));

        return { item, next };
      });

      // An item with no price is skipped by a percentage adjustment rather
      // than being given one: there is nothing to adjust (GOALS I9).
      const applicable = updates.filter((entry) => entry.next !== null && entry.next !== entry.item.priceMinor);

      await prisma.$transaction([
        ...applicable.map((entry) =>
          prisma.menuItem.update({
            where: { id: entry.item.id },
            data: { priceMinor: entry.next },
          }),
        ),
        ...applicable.map((entry) =>
          prisma.priceHistory.create({
            data: {
              businessId: context.businessId,
              itemId: entry.item.id,
              itemCode: entry.item.itemCode,
              oldPriceMinor: entry.item.priceMinor,
              newPriceMinor: entry.next,
              currency: entry.item.currency,
              changedById: user.id,
            },
          }),
        ),
      ]);

      changed = applicable.length;
      break;
    }

    case 'delete':
      ({ count: changed } = await prisma.menuItem.deleteMany({
        where: { id: { in: ids }, ...tenantScope(context) },
      }));
      break;
  }

  await recordAudit({
    action: 'items.bulk_updated',
    entity: 'menu_item',
    businessId: context.businessId,
    userId: user.id,
    metadata: { kind: change.kind, requested: codes.length, changed, missing },
  });

  return { changed, missing };
}
