import { prisma } from '@/server/db/client';
import { listBusinessesForUser } from '@/server/admin/business-service';
import { hasPublishedHours, parseWorkingHours } from '@/server/business/hours';
import type { AuthenticatedUser } from '@/server/tenancy/context';

/**
 * "What needs my attention?" across every business a user can see
 * (master spec §88, §143, §144).
 *
 * The scale requirement is the point: §143 asks the platform to work at a
 * thousand businesses, and §144 says the operator must not have to open each
 * one to find out what is wrong. So this deliberately does *not* run the full
 * Profile Health evaluation per business — that reads a menu tree each time,
 * and a thousand of those is a slow page and a heavy database.
 *
 * Instead it asks a small number of aggregate questions across the whole
 * estate, each one an indexed count, and links to the business's own health
 * screen for the detail. Cheap to run, and honest: every figure is a real
 * count, never a sample or an estimate.
 */

export interface AttentionItem {
  code: string;
  label: string;
  count: number;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  /** Businesses affected, capped — the list is a starting point, not a report. */
  businesses: { id: string; name: string }[];
  href?: string;
}

const CAP = 5;

export async function getAttention(user: AuthenticatedUser): Promise<AttentionItem[]> {
  const visible = await listBusinessesForUser(user);
  const ids = visible.map((business) => business.id);
  const nameOf = new Map(
    visible.map((business) => [business.id, business.nameEn ?? business.nameAr]),
  );

  if (ids.length === 0) return [];

  const label = (id: string) => ({ id, name: nameOf.get(id) ?? id });

  const [
    unpricedItems,
    neverPublished,
    draftBusinesses,
    expiringOffers,
    openRequests,
    pendingApprovals,
    businessesWithHours,
    itemsWithoutImages,
  ] = await Promise.all([
    prisma.menuItem.groupBy({
      by: ['businessId'],
      where: { businessId: { in: ids }, priceMinor: null, availability: { not: 'HIDDEN' } },
      _count: { _all: true },
    }),
    prisma.menu.groupBy({
      by: ['businessId'],
      where: { businessId: { in: ids }, currentVersionId: null },
      _count: { _all: true },
    }),
    prisma.business.findMany({
      where: { id: { in: ids }, status: 'DRAFT' },
      select: { id: true },
    }),
    prisma.offer.findMany({
      where: {
        businessId: { in: ids },
        isActive: true,
        endsAt: { gte: new Date(), lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
      },
      select: { businessId: true },
    }),
    prisma.changeRequest.groupBy({
      by: ['businessId'],
      where: { businessId: { in: ids }, isDone: false },
      _count: { _all: true },
    }),
    prisma.previewLink.findMany({
      where: {
        businessId: { in: ids },
        state: 'PENDING',
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { businessId: true },
    }),
    prisma.business.findMany({
      where: { id: { in: ids } },
      select: { id: true, workingHours: true },
    }),
    prisma.menuItem.groupBy({
      by: ['businessId'],
      where: { businessId: { in: ids }, imageMediaId: null },
      _count: { _all: true },
    }),
  ]);

  const items: AttentionItem[] = [];

  const fromGroups = (
    groups: { businessId: string; _count: { _all: number } }[],
    code: string,
    severity: AttentionItem['severity'],
    describe: (total: number, businesses: number) => string,
    path: string,
  ) => {
    if (groups.length === 0) return;

    const total = groups.reduce((sum, group) => sum + group._count._all, 0);

    items.push({
      code,
      severity,
      count: total,
      label: describe(total, groups.length),
      businesses: groups.slice(0, CAP).map((group) => label(group.businessId)),
      href: groups.length === 1 ? `/admin/businesses/${groups[0]!.businessId}${path}` : undefined,
    });
  };

  fromGroups(
    unpricedItems,
    'items_without_price',
    'ERROR',
    (total, businesses) =>
      `${total} visible item${total === 1 ? '' : 's'} without a price, across ${businesses} business${businesses === 1 ? '' : 'es'}`,
    '/menus',
  );

  fromGroups(
    neverPublished,
    'menus_never_published',
    'ERROR',
    (total, businesses) =>
      `${total} menu${total === 1 ? '' : 's'} never published, across ${businesses} business${businesses === 1 ? '' : 'es'}`,
    '/menus',
  );

  if (draftBusinesses.length > 0) {
    items.push({
      code: 'businesses_draft',
      severity: 'WARNING',
      count: draftBusinesses.length,
      label: `${draftBusinesses.length} business${draftBusinesses.length === 1 ? ' is' : 'es are'} still a draft, so the public profile returns "not found"`,
      businesses: draftBusinesses.slice(0, CAP).map((business) => label(business.id)),
    });
  }

  const expiringByBusiness = new Set(expiringOffers.map((offer) => offer.businessId));
  if (expiringOffers.length > 0) {
    items.push({
      code: 'offers_expiring',
      severity: 'WARNING',
      count: expiringOffers.length,
      label: `${expiringOffers.length} offer${expiringOffers.length === 1 ? '' : 's'} expire within three days`,
      businesses: [...expiringByBusiness].slice(0, CAP).map(label),
    });
  }

  const approvalsByBusiness = new Set(pendingApprovals.map((link) => link.businessId));
  if (approvalsByBusiness.size > 0) {
    items.push({
      code: 'approvals_pending',
      severity: 'INFO',
      count: approvalsByBusiness.size,
      label: `${approvalsByBusiness.size} business${approvalsByBusiness.size === 1 ? ' is' : 'es are'} waiting on a client response`,
      businesses: [...approvalsByBusiness].slice(0, CAP).map(label),
    });
  }

  fromGroups(
    openRequests,
    'change_requests_open',
    'WARNING',
    (total, businesses) =>
      `${total} change request${total === 1 ? '' : 's'} still open, across ${businesses} business${businesses === 1 ? '' : 'es'}`,
    '/review',
  );

  const withoutHours = businessesWithHours.filter(
    (business) => !hasPublishedHours(parseWorkingHours(business.workingHours)),
  );
  if (withoutHours.length > 0) {
    items.push({
      code: 'hours_missing',
      severity: 'INFO',
      count: withoutHours.length,
      label: `${withoutHours.length} business${withoutHours.length === 1 ? ' has' : 'es have'} no opening hours`,
      businesses: withoutHours.slice(0, CAP).map((business) => label(business.id)),
      href:
        withoutHours.length === 1
          ? `/admin/businesses/${withoutHours[0]!.id}/hours`
          : undefined,
    });
  }

  fromGroups(
    itemsWithoutImages,
    'items_without_image',
    'INFO',
    (total, businesses) =>
      `${total} item${total === 1 ? '' : 's'} without a photograph, across ${businesses} business${businesses === 1 ? '' : 'es'}`,
    '/media',
  );

  const order = { ERROR: 0, WARNING: 1, INFO: 2 } as const;
  return items.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
}
