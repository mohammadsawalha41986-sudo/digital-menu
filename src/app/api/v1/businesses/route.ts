import { authenticateApiRequest, scopeFilter } from '@/server/api/auth';
import { buildMeta, handleApiError, ok, parseListQuery } from '@/server/api/response';
import { prisma } from '@/server/db/client';

/**
 * GET /api/v1/businesses — list businesses this key may read.
 *
 * The response carries public identifiers and never internal ones, exactly as
 * the public profile does (master spec §122): a consuming system addresses a
 * business by `publicId`, which is also what the QR encodes, so the two
 * systems agree on identity without sharing a database (§06, §130).
 */

export const dynamic = 'force-dynamic';

const SORTS = ['createdAt', 'updatedAt', 'slug'] as const;

export async function GET(request: Request) {
  try {
    const credential = await authenticateApiRequest(request);
    const query = parseListQuery(request, SORTS);

    const where = {
      ...scopeFilter(credential),
      ...(query.search
        ? {
            OR: [
              { nameAr: { contains: query.search, mode: 'insensitive' as const } },
              { nameEn: { contains: query.search, mode: 'insensitive' as const } },
              { slug: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, businesses] = await Promise.all([
      prisma.business.count({ where }),
      prisma.business.findMany({
        where,
        orderBy: { [query.sort]: query.order },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: {
          publicId: true,
          slug: true,
          type: true,
          status: true,
          nameAr: true,
          nameEn: true,
          defaultLocale: true,
          currency: true,
          templateKey: true,
          variantKey: true,
          updatedAt: true,
          _count: { select: { menus: true, branches: true, items: true } },
        },
      }),
    ]);

    return ok(
      businesses.map((business) => ({
        public_id: business.publicId,
        slug: business.slug,
        type: business.type,
        status: business.status,
        name: { ar: business.nameAr, en: business.nameEn },
        default_locale: business.defaultLocale,
        currency: business.currency,
        template: { family: business.templateKey, variant: business.variantKey },
        counts: {
          menus: business._count.menus,
          branches: business._count.branches,
          items: business._count.items,
        },
        updated_at: business.updatedAt.toISOString(),
      })),
      buildMeta(query, total),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
