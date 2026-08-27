import { prisma } from '@/server/db/client';
import {
  requireTenantContext,
  tenantScope,
  type AuthenticatedUser,
} from '@/server/tenancy/context';

/**
 * Analytics reporting (master spec §111).
 *
 * Every figure here is a count over recorded rows. Nothing is estimated,
 * extrapolated or modelled — a dashboard that infers numbers is worse than one
 * that reports a small true number, because staff quote these to clients.
 */

export type TimeRange = 'today' | '7d' | '30d' | '90d' | 'all';

export const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
];

export function rangeStart(range: TimeRange, now = new Date()): Date | null {
  switch (range) {
    case 'today': {
      const start = new Date(now);
      start.setUTCHours(0, 0, 0, 0);
      return start;
    }
    case '7d':
      return new Date(now.getTime() - 7 * 86_400_000);
    case '30d':
      return new Date(now.getTime() - 30 * 86_400_000);
    case '90d':
      return new Date(now.getTime() - 90 * 86_400_000);
    case 'all':
      return null;
  }
}

export interface AnalyticsReport {
  range: TimeRange;
  profileViews: number;
  uniqueVisitors: number;
  qrScans: number;
  totalEvents: number;
  byEventType: { eventType: string; count: number }[];
  topItems: { key: string; count: number }[];
  topCategories: { key: string; count: number }[];
  byDevice: { device: string; count: number }[];
  byLocale: { locale: string; count: number }[];
  /** True when nothing has been recorded yet, so the UI can say so plainly. */
  empty: boolean;
}

export async function buildReport(
  user: AuthenticatedUser,
  businessId: string,
  range: TimeRange,
): Promise<AnalyticsReport> {
  const context = await requireTenantContext(user, businessId, 'VIEWER');
  const start = rangeStart(range);

  const where = {
    ...tenantScope(context),
    ...(start ? { createdAt: { gte: start } } : {}),
  };

  const [profileViews, qrScans, totalEvents, byEventType, byDevice, byLocale, uniqueRows] =
    await Promise.all([
      prisma.analyticsEvent.count({
        where: { ...where, eventType: { in: ['profile_view', 'branch_view'] } },
      }),
      prisma.analyticsEvent.count({ where: { ...where, eventType: 'qr_scan' } }),
      prisma.analyticsEvent.count({ where }),
      prisma.analyticsEvent.groupBy({
        by: ['eventType'],
        where,
        _count: { _all: true },
        orderBy: { _count: { eventType: 'desc' } },
      }),
      prisma.analyticsEvent.groupBy({ by: ['device'], where, _count: { _all: true } }),
      prisma.analyticsEvent.groupBy({ by: ['locale'], where, _count: { _all: true } }),
      // Distinct daily hashes: the identifier rotates, so this counts unique
      // visitors within a day and deliberately cannot count them across days.
      prisma.analyticsEvent.findMany({
        where: { ...where, visitorHash: { not: null } },
        distinct: ['visitorHash'],
        select: { visitorHash: true },
      }),
    ]);

  const [topItems, topCategories] = await Promise.all([
    topTargets(where, 'item_view'),
    topTargets(where, 'category_view'),
  ]);

  return {
    range,
    profileViews,
    uniqueVisitors: uniqueRows.length,
    qrScans,
    totalEvents,
    byEventType: byEventType.map((row) => ({
      eventType: row.eventType,
      count: row._count._all,
    })),
    topItems,
    topCategories,
    byDevice: byDevice.map((row) => ({ device: row.device, count: row._count._all })),
    byLocale: byLocale.map((row) => ({ locale: row.locale ?? 'unknown', count: row._count._all })),
    empty: totalEvents === 0,
  };
}

async function topTargets(where: object, eventType: string) {
  const rows = await prisma.analyticsEvent.groupBy({
    by: ['targetKey'],
    where: { ...where, eventType, targetKey: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { targetKey: 'desc' } },
    take: 10,
  });

  return rows.map((row) => ({ key: row.targetKey ?? '', count: row._count._all }));
}
