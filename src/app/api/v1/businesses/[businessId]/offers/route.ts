import { authenticateApiRequest, scopeFilter } from '@/server/api/auth';
import { failure, handleApiError, ok } from '@/server/api/response';
import { prisma } from '@/server/db/client';
import { parsePublicId } from '@/lib/public-id';
import { discountPercent, offerState } from '@/server/offers/scheduling';

/**
 * GET /api/v1/businesses/{publicId}/offers
 *
 * Each offer carries its computed state — live, scheduled, expired, disabled —
 * so a marketing system does not re-implement the window arithmetic and reach
 * a different answer than the profile does.
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

    const business = await prisma.business.findFirst({
      where: { publicId, ...scopeFilter(credential) },
      select: {
        currency: true,
        offers: { orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] },
      },
    });

    if (!business) return failure(404, 'not_found', 'Not found');

    const now = new Date();

    return ok(
      business.offers.map((offer) => ({
        key: offer.key,
        title: { ar: offer.titleAr, en: offer.titleEn },
        description: { ar: offer.descriptionAr, en: offer.descriptionEn },
        state: offerState(offer, now),
        placement: offer.placement,
        original_price_minor: offer.originalPriceMinor,
        offer_price_minor: offer.offerPriceMinor,
        currency: business.currency,
        discount_percent: discountPercent(
          offer.originalPriceMinor,
          offer.offerPriceMinor,
          offer.discountPercent,
        ),
        starts_at: offer.startsAt?.toISOString() ?? null,
        ends_at: offer.endsAt?.toISOString() ?? null,
        timezone: offer.timezone,
        cta: { label: { ar: offer.ctaLabelAr, en: offer.ctaLabelEn }, url: offer.ctaUrl },
      })),
    );
  } catch (error) {
    return handleApiError(error);
  }
}
