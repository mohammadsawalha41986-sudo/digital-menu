import { authenticateApiRequest, scopeFilter } from '@/server/api/auth';
import { failure, handleApiError, ok } from '@/server/api/response';
import { prisma } from '@/server/db/client';
import { parsePublicId } from '@/lib/public-id';
import { formatMinorAsDecimal } from '@/lib/money';

/**
 * GET /api/v1/businesses/{publicId}/menus
 *
 * The full menu tree, with prices in *both* representations: integer minor
 * units for arithmetic and a decimal string for display. A consumer that
 * needs to compute never has to parse, and one that needs to show never has
 * to know a currency's minor-unit count.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ businessId: string }> },
) {
  try {
    const credential = await authenticateApiRequest(request);
    const { businessId } = await context.params;

    const publicId = parsePublicId(businessId);
    if (!publicId) return failure(404, 'not_found', 'Not found');

    const url = new URL(request.url);
    // `published=true` returns only what a visitor would see right now.
    const publishedOnly = url.searchParams.get('published') === 'true';

    const business = await prisma.business.findFirst({
      where: { publicId, ...scopeFilter(credential) },
      select: {
        currency: true,
        menus: {
          where: publishedOnly ? { status: 'ACTIVE', currentVersion: { isNot: null } } : {},
          orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
          select: {
            key: true,
            titleAr: true,
            titleEn: true,
            status: true,
            currentVersion: { select: { version: true, publishedAt: true } },
            categories: {
              orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
              select: {
                key: true,
                nameAr: true,
                nameEn: true,
                isActive: true,
                items: {
                  orderBy: [{ sortOrder: 'asc' }, { itemCode: 'asc' }],
                  select: {
                    itemCode: true,
                    nameAr: true,
                    nameEn: true,
                    descriptionAr: true,
                    descriptionEn: true,
                    priceMinor: true,
                    currency: true,
                    calories: true,
                    allergens: true,
                    tags: true,
                    availability: true,
                    isFeatured: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!business) return failure(404, 'not_found', 'Not found');

    return ok(
      business.menus.map((menu) => ({
        key: menu.key,
        title: { ar: menu.titleAr, en: menu.titleEn },
        status: menu.status,
        published_version: menu.currentVersion?.version ?? null,
        published_at: menu.currentVersion?.publishedAt?.toISOString() ?? null,
        categories: menu.categories.map((category) => ({
          key: category.key,
          name: { ar: category.nameAr, en: category.nameEn },
          is_active: category.isActive,
          items: category.items.map((item) => ({
            item_code: item.itemCode,
            name: { ar: item.nameAr, en: item.nameEn },
            description: { ar: item.descriptionAr, en: item.descriptionEn },
            price:
              item.priceMinor === null
                ? null
                : {
                    minor_units: item.priceMinor,
                    decimal: formatMinorAsDecimal(item.priceMinor, item.currency),
                    currency: item.currency,
                  },
            // Null means the business never measured it — never a zero (§37).
            calories: item.calories,
            allergens: item.allergens,
            tags: item.tags,
            availability: item.availability,
            is_featured: item.isFeatured,
          })),
        })),
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
