import { prisma } from '@/server/db/client';
import { requireTenantContext, tenantScope, type AuthenticatedUser } from '@/server/tenancy/context';

/**
 * Reading the price history and the audit log (master spec §146, §147).
 *
 * Both were written diligently and read almost nowhere: price history had no
 * reader at all, and the audit log surfaced as the last eight rows on the
 * dashboard with no filter, no paging and no before-and-after values. Data
 * captured and never shown is a cost with no benefit, and in an audit trail it
 * is worse than that — it is a control that nobody can exercise.
 */

export interface PriceChangeRow {
  id: string;
  itemCode: string;
  itemName: string | null;
  oldPriceMinor: number | null;
  newPriceMinor: number | null;
  currency: string;
  changedBy: string | null;
  /** Set when the change arrived through an import, so a batch is traceable. */
  batchId: string | null;
  createdAt: Date;
}

export async function getPriceHistory(
  user: AuthenticatedUser,
  businessId: string,
  options: { itemCode?: string | null; page?: number; perPage?: number } = {},
) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const perPage = Math.min(Math.max(options.perPage ?? 50, 1), 200);
  const page = Math.max(options.page ?? 1, 1);

  const where = {
    ...tenantScope(context),
    ...(options.itemCode ? { itemCode: options.itemCode } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.priceHistory.count({ where }),
    prisma.priceHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        itemCode: true,
        oldPriceMinor: true,
        newPriceMinor: true,
        currency: true,
        batchId: true,
        createdAt: true,
        changedBy: { select: { name: true } },
      },
    }),
  ]);

  // Names are looked up separately: a history row deliberately survives the
  // deletion of its item, so it cannot depend on a join to that item.
  const codes = [...new Set(rows.map((row) => row.itemCode))];
  const items = await prisma.menuItem.findMany({
    where: { businessId: context.businessId, itemCode: { in: codes } },
    select: { itemCode: true, nameAr: true, nameEn: true },
  });

  const nameOf = new Map(items.map((item) => [item.itemCode, item.nameEn ?? item.nameAr]));

  return {
    total,
    page,
    perPage,
    pages: Math.max(1, Math.ceil(total / perPage)),
    rows: rows.map(
      (row): PriceChangeRow => ({
        id: row.id,
        itemCode: row.itemCode,
        itemName: nameOf.get(row.itemCode) ?? null,
        oldPriceMinor: row.oldPriceMinor,
        newPriceMinor: row.newPriceMinor,
        currency: row.currency,
        changedBy: row.changedBy?.name ?? null,
        batchId: row.batchId,
        createdAt: row.createdAt,
      }),
    ),
  };
}

export interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  user: string | null;
  createdAt: Date;
  /** Field-level before and after, where the writer recorded them. */
  changes: { field: string; from: string | null; to: string | null }[];
  /** Anything else the writer attached, rendered as plain pairs. */
  details: { key: string; value: string }[];
}

/**
 * Renders a stored metadata blob into something readable.
 *
 * `diffFields` writes `{ field: { from, to } }`; other callers attach flat
 * values. Both shapes are handled here rather than by making every writer
 * conform, because the log already contains both and rewriting history is not
 * an option.
 */
function readMetadata(metadata: unknown): Pick<AuditRow, 'changes' | 'details'> {
  const changes: AuditRow['changes'] = [];
  const details: AuditRow['details'] = [];

  if (!metadata || typeof metadata !== 'object') return { changes, details };

  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      ('from' in value || 'to' in value)
    ) {
      const pair = value as { from?: unknown; to?: unknown };
      changes.push({
        field: key,
        from: pair.from === null || pair.from === undefined ? null : String(pair.from),
        to: pair.to === null || pair.to === undefined ? null : String(pair.to),
      });
    } else {
      details.push({ key, value: value === null ? '—' : String(value) });
    }
  }

  return { changes, details };
}

export async function getAuditLog(
  user: AuthenticatedUser,
  businessId: string,
  options: { action?: string | null; page?: number; perPage?: number } = {},
) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const perPage = Math.min(Math.max(options.perPage ?? 50, 1), 200);
  const page = Math.max(options.page ?? 1, 1);

  const where = {
    businessId: context.businessId,
    ...(options.action ? { action: { startsWith: options.action } } : {}),
  };

  const [total, rows, actions] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    // The filter offers only actions this business has actually recorded —
    // a dropdown of every action the codebase can emit is mostly noise.
    prisma.auditLog.groupBy({
      by: ['action'],
      where: { businessId: context.businessId },
      _count: { _all: true },
      orderBy: { _count: { action: 'desc' } },
      take: 40,
    }),
  ]);

  return {
    total,
    page,
    perPage,
    pages: Math.max(1, Math.ceil(total / perPage)),
    availableActions: actions.map((entry) => ({
      action: entry.action,
      count: entry._count._all,
    })),
    rows: rows.map(
      (row): AuditRow => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        user: row.user?.name ?? null,
        createdAt: row.createdAt,
        ...readMetadata(row.metadata),
      }),
    ),
  };
}
