import { handleApiError, failure, ok } from '@/server/api/response';
import { getPublicProfile } from '@/server/profile/repository';
import { getEnv } from '@/lib/env';

/**
 * GET /api/v1/profiles/{publicId} — the public read model, unauthenticated.
 *
 * Deliberately open: it returns exactly what the rendered profile already
 * shows a visitor, so requiring a key would protect nothing while making the
 * obvious integration harder. Everything private is excluded upstream by the
 * same repository the page uses — one code path, one set of rules.
 */

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  try {
    const { publicId } = await context.params;
    const branchKey = new URL(request.url).searchParams.get('branch');

    const profile = await getPublicProfile(publicId, { branchKey });
    if (!profile) return failure(404, 'not_found', 'Not found');

    const base = getEnv().PUBLIC_URL.replace(/\/$/, '');

    return ok({
      public_id: profile.publicId,
      // The canonical URL and the QR destination are the same string, by
      // construction — an integrating system never derives its own (GOALS I1).
      url: `${base}/m/${profile.publicId}`,
      business_type: profile.businessType,
      default_locale: profile.defaultLocale,
      currency: profile.currency,
      name: { ar: profile.nameAr, en: profile.nameEn },
      description: { ar: profile.descriptionAr, en: profile.descriptionEn },
      template: { family: profile.templateKey, variant: profile.variantKey },
      active_branch: profile.activeBranchKey,
      branches: profile.branches.map((branch) => ({
        key: branch.key,
        name: { ar: branch.nameAr, en: branch.nameEn },
        url: `${base}/m/${profile.publicId}/b/${branch.key}`,
      })),
      contact: profile.contact,
      menus: profile.menus.map((menu) => ({
        key: menu.key,
        title: { ar: menu.titleAr, en: menu.titleEn },
        published_version: menu.publishedVersion,
        categories: menu.categories.map((category) => ({
          key: category.key,
          name: { ar: category.nameAr, en: category.nameEn },
          items: category.items.map((item) => ({
            item_code: item.code,
            name: { ar: item.nameAr, en: item.nameEn },
            description: { ar: item.descriptionAr, en: item.descriptionEn },
            price_minor: item.priceMinor,
            currency: item.currency,
            calories: item.calories,
            allergens: item.allergens,
            tags: item.tags,
            unavailable: item.isUnavailable,
            image: item.image?.url ?? null,
          })),
        })),
      })),
      offers: profile.offers.map((offer) => ({
        key: offer.key,
        title: { ar: offer.titleAr, en: offer.titleEn },
        offer_price_minor: offer.offerPriceMinor,
        original_price_minor: offer.originalPriceMinor,
        discount_percent: offer.discountPercent,
        ends_at: offer.endsAt?.toISOString() ?? null,
      })),
      downloads: profile.downloads.map((download) => ({
        key: download.key,
        title: { ar: download.titleAr, en: download.titleEn },
        kind: download.kind,
        url: download.kind === 'link' ? download.url : `${base}${download.url}`,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
