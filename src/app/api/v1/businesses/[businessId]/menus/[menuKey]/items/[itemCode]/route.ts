import { z } from 'zod';
import {
  authenticateApiRequest,
  requireScope,
  scopeFilter,
} from '@/server/api/auth';
import { failure, handleApiError, ok } from '@/server/api/response';
import { prisma } from '@/server/db/client';
import { parsePublicId } from '@/lib/public-id';
import { diffFields, recordAudit } from '@/server/audit/log';
import { invalidateProfile } from '@/server/profile/cache';

export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    category_key: z.string().trim().min(1).max(120).optional(),
    name_ar: z.string().trim().min(1).max(240).optional(),
    name_en: z.string().trim().max(240).nullable().optional(),
    description_ar: z.string().trim().max(2000).nullable().optional(),
    description_en: z.string().trim().max(2000).nullable().optional(),
    price_minor: z.number().int().min(0).max(100_000_000).nullable().optional(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
    calories: z.number().int().min(0).max(100_000).nullable().optional(),
    allergens: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    availability: z.enum(['AVAILABLE', 'UNAVAILABLE', 'SEASONAL', 'HIDDEN']).optional(),
    is_featured: z.boolean().optional(),
    sort_order: z.number().int().min(-100_000).max(100_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

async function resolveTarget(
  credential: Awaited<ReturnType<typeof authenticateApiRequest>>,
  publicId: string,
  menuKey: string,
  itemCode: string,
) {
  const business = await prisma.business.findFirst({
    where: { publicId, ...scopeFilter(credential) },
    select: { id: true, publicId: true },
  });
  if (!business) return null;

  const menu = await prisma.menu.findFirst({
    where: { businessId: business.id, key: menuKey },
    select: { id: true },
  });
  if (!menu) return null;

  const item = await prisma.menuItem.findFirst({
    where: { businessId: business.id, itemCode, category: { menuId: menu.id } },
    select: {
      id: true,
      categoryId: true,
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
      sortOrder: true,
    },
  });
  if (!item) return null;
  return { business, menu, item };
}

/** PATCH /api/v1/businesses/{publicId}/menus/{menuKey}/items/{itemCode} */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ businessId: string; menuKey: string; itemCode: string }> },
) {
  try {
    const credential = await authenticateApiRequest(request);
    requireScope(credential, 'write');
    const params = await context.params;
    const publicId = parsePublicId(params.businessId);
    if (!publicId) return failure(404, 'not_found', 'Not found');

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return failure(400, 'invalid_json', 'Request body must be valid JSON');
    }
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return failure(422, 'validation_error', 'Invalid item data', parsed.error.flatten());
    }

    const target = await resolveTarget(credential, publicId, params.menuKey, params.itemCode);
    if (!target) return failure(404, 'not_found', 'Not found');

    let categoryId: string | undefined;
    if (parsed.data.category_key) {
      const category = await prisma.menuCategory.findFirst({
        where: {
          businessId: target.business.id,
          menuId: target.menu.id,
          key: parsed.data.category_key,
        },
        select: { id: true },
      });
      if (!category) return failure(422, 'category_not_found', 'category_key does not exist in this menu');
      categoryId = category.id;
    }

    const data = {
      ...(categoryId ? { categoryId } : {}),
      ...(parsed.data.name_ar !== undefined ? { nameAr: parsed.data.name_ar } : {}),
      ...(parsed.data.name_en !== undefined ? { nameEn: parsed.data.name_en } : {}),
      ...(parsed.data.description_ar !== undefined ? { descriptionAr: parsed.data.description_ar } : {}),
      ...(parsed.data.description_en !== undefined ? { descriptionEn: parsed.data.description_en } : {}),
      ...(parsed.data.price_minor !== undefined ? { priceMinor: parsed.data.price_minor } : {}),
      ...(parsed.data.currency !== undefined ? { currency: parsed.data.currency } : {}),
      ...(parsed.data.calories !== undefined ? { calories: parsed.data.calories } : {}),
      ...(parsed.data.allergens !== undefined ? { allergens: parsed.data.allergens } : {}),
      ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
      ...(parsed.data.availability !== undefined ? { availability: parsed.data.availability } : {}),
      ...(parsed.data.is_featured !== undefined ? { isFeatured: parsed.data.is_featured } : {}),
      ...(parsed.data.sort_order !== undefined ? { sortOrder: parsed.data.sort_order } : {}),
    };

    const updated = await prisma.menuItem.update({
      where: { id: target.item.id },
      data,
      select: {
        itemCode: true,
        nameAr: true,
        nameEn: true,
        priceMinor: true,
        currency: true,
        availability: true,
      },
    });

    const changes = diffFields(target.item, data);
    await recordAudit({
      action: 'item.updated',
      entity: 'menu_item',
      entityId: target.item.id,
      businessId: target.business.id,
      metadata: { apiClientId: credential.clientId, changes },
    });
    if (parsed.data.price_minor !== undefined && parsed.data.price_minor !== target.item.priceMinor) {
      await recordAudit({
        action: 'item.price_changed',
        entity: 'menu_item',
        entityId: target.item.id,
        businessId: target.business.id,
        metadata: {
          apiClientId: credential.clientId,
          from: target.item.priceMinor,
          to: parsed.data.price_minor,
          currency: updated.currency,
        },
      });
    }
    invalidateProfile(target.business.publicId);

    return ok({ ...updated, publication: 'draft' });
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/v1/businesses/{publicId}/menus/{menuKey}/items/{itemCode} */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ businessId: string; menuKey: string; itemCode: string }> },
) {
  try {
    const credential = await authenticateApiRequest(request);
    requireScope(credential, 'write');
    const params = await context.params;
    const publicId = parsePublicId(params.businessId);
    if (!publicId) return failure(404, 'not_found', 'Not found');

    const target = await resolveTarget(credential, publicId, params.menuKey, params.itemCode);
    if (!target) return failure(404, 'not_found', 'Not found');

    await prisma.menuItem.delete({ where: { id: target.item.id } });
    await recordAudit({
      action: 'item.deleted',
      entity: 'menu_item',
      entityId: target.item.id,
      businessId: target.business.id,
      metadata: { apiClientId: credential.clientId, itemCode: target.item.itemCode },
    });
    invalidateProfile(target.business.publicId);

    return ok({ deleted: true, item_code: target.item.itemCode, publication: 'draft' });
  } catch (error) {
    return handleApiError(error);
  }
}
