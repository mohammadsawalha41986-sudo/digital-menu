import { authenticateApiRequest, scopeFilter } from '@/server/api/auth';
import { failure, handleApiError, ok } from '@/server/api/response';
import { prisma } from '@/server/db/client';
import { parsePublicId } from '@/lib/public-id';

/**
 * GET /api/v1/businesses/{publicId}
 *
 * Addressed by public id, not internal id — the API and the QR speak the same
 * identifier, so an integrating system never needs to learn a second one.
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

    const scope = scopeFilter(credential);

    const business = await prisma.business.findFirst({
      where: { publicId, ...scope },
      select: {
        publicId: true,
        slug: true,
        type: true,
        status: true,
        nameAr: true,
        nameEn: true,
        descriptionAr: true,
        descriptionEn: true,
        defaultLocale: true,
        currency: true,
        templateKey: true,
        variantKey: true,
        phone: true,
        whatsapp: true,
        email: true,
        website: true,
        instagram: true,
        tiktok: true,
        facebook: true,
        linkedin: true,
        youtube: true,
        googleMapsUrl: true,
        addressAr: true,
        addressEn: true,
        workingHours: true,
        servicePackage: true,
        createdAt: true,
        updatedAt: true,
        branches: {
          orderBy: [{ sortOrder: 'asc' }],
          select: { key: true, nameAr: true, nameEn: true, isActive: true },
        },
      },
    });

    // Out of scope and nonexistent are the same answer.
    if (!business) return failure(404, 'not_found', 'Not found');

    return ok({
      public_id: business.publicId,
      slug: business.slug,
      type: business.type,
      status: business.status,
      name: { ar: business.nameAr, en: business.nameEn },
      description: { ar: business.descriptionAr, en: business.descriptionEn },
      default_locale: business.defaultLocale,
      currency: business.currency,
      template: { family: business.templateKey, variant: business.variantKey },
      contact: {
        phone: business.phone,
        whatsapp: business.whatsapp,
        email: business.email,
        website: business.website,
        instagram: business.instagram,
        tiktok: business.tiktok,
        facebook: business.facebook,
        linkedin: business.linkedin,
        youtube: business.youtube,
        google_maps_url: business.googleMapsUrl,
        address: { ar: business.addressAr, en: business.addressEn },
        working_hours: business.workingHours,
      },
      service_package: business.servicePackage,
      branches: business.branches.map((branch) => ({
        key: branch.key,
        name: { ar: branch.nameAr, en: branch.nameEn },
        is_active: branch.isActive,
      })),
      created_at: business.createdAt.toISOString(),
      updated_at: business.updatedAt.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
