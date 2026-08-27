import { authenticateApiRequest, scopeFilter } from '@/server/api/auth';
import { failure, handleApiError, ok } from '@/server/api/response';
import { prisma } from '@/server/db/client';
import { parsePublicId } from '@/lib/public-id';
import { rangeStart, type TimeRange } from '@/server/analytics/report';

/**
 * GET /api/v1/businesses/{publicId}/analytics
 *
 * Aggregates only. The event table holds no personal data to begin with
 * (§113), and this endpoint exposes counts rather than rows, so an integrating
 * system cannot reconstruct individual visits even in principle.
 */

export const dynamic = 'force-dynamic';

const RANGES: TimeRange[] = ['today', '7d', '30d', '90d', 'all'];

export async function GET(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  try {
    const credential = await authenticateApiRequest(request);
    const { businessId } = await context.params;

    const publicId = parsePublicId(businessId);
    if (!publicId) return failure(404, 'not_found', 'Not found');

    const business = await prisma.business.findFirst({
      where: { publicId, ...scopeFilter(credential) },
      select: { id: true },
    });

    if (!business) return failure(404, 'not_found', 'Not found');

    const requested = new URL(request.url).searchParams.get('range') ?? '30d';
    const range: TimeRange = RANGES.includes(requested as TimeRange)
      ? (requested as TimeRange)
      : '30d';

    const start = rangeStart(range);
    const where = {
      businessId: business.id,
      ...(start ? { createdAt: { gte: start } } : {}),
    };

    const [byEventType, byDevice, uniqueRows] = await Promise.all([
      prisma.analyticsEvent.groupBy({ by: ['eventType'], where, _count: { _all: true } }),
      prisma.analyticsEvent.groupBy({ by: ['device'], where, _count: { _all: true } }),
      prisma.analyticsEvent.findMany({
        where: { ...where, visitorHash: { not: null } },
        distinct: ['visitorHash'],
        select: { visitorHash: true },
      }),
    ]);

    const counts = Object.fromEntries(
      byEventType.map((row) => [row.eventType, row._count._all]),
    );

    return ok({
      range,
      since: start?.toISOString() ?? null,
      profile_views: (counts.profile_view ?? 0) + (counts.branch_view ?? 0),
      qr_scans: counts.qr_scan ?? 0,
      unique_visitors: uniqueRows.length,
      events: counts,
      devices: Object.fromEntries(byDevice.map((row) => [row.device, row._count._all])),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
