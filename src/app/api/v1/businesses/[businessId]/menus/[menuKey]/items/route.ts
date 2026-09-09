import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authenticateApiRequest,
  requireScope,
  scopeFilter,
} from '@/server/api/auth';
import { failure, handleApiError } from '@/server/api/response';
import { prisma } from '@/server/db/client';
import { parsePublicId } from '@/lib/public-id';
import { recordAudit } from '@/server/audit/log';
import { invalidateProfile } from '@/server/profile/cache';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  category_key: z.string().trim().min(1).max(120),
  item_code: z.string().trim().min(1).max(120),
  name_ar: z.string().trim().min(1).max(240),
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
});

/** POST /api/v1/businesses/{publicId}/menus/{menuKey}/items */
export async function POST(
  request: Request,
  context: { params: Promise<{ businessId: string; menuKey: string }> },
) {
  try {
    const credential = await authenticateApiRequest(request);
    requireScope(credential, 'write');
    const { businessId, menuKey } = await context.params;
    const publicId = parsePublicId(businessId);
    if (!publicId) return failure(404, 'not_found', 'Not found');

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return failure(400, 'invalid_json', 'Request body must be valid JSON');
    }
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return failure(422, 'validation_error', 'Invalid item data', parsed.error.flatten());
    }

    const business = await prisma.business.findFirst({
      where: { publicId, ...scopeFilter(credential) },
      select: { id: true, publicId: true, currency: true },
    });
    if (!business) return failure(404, 'not_found', 'Not found');

    const menu = await prisma.menu.findFirst({
      where: { businessId: business.id, key: menuKey },
      select: { id: true, currency: true },
    });
    if (!menu) return failure(404, 'not_found', 'Menu not found');

    const category = await prisma.menuCategory.findFirst({
      where: { businessId: business.id, menuId: menu.id, key: parsed.data.category_key },
      select: { id: true },
    });
    if (!category) return failure(422, 'category_not_found', 'category_key does not exist in this menu');

    const existing = await prisma.menuItem.findFirst({
      where: { businessId: business.id, itemCode: parsed.data.item_code },
      select: { id: true },
    });
    if (existing) {
      return failure(409, 'item_exists', 'item_code already exists; PATCH the existing item instead');
    }

    const item = await prisma.menuItem.create({
      data: {
        businessId: business.id,
        categoryId: category.id,
        itemCode: parsed.data.item_code,
        nameAr: parsed.data.name_ar,
        nameEn: parsed.data.name_en ?? null,
        descriptionAr: parsed.data.description_ar ?? null,
        descriptionEn: parsed.data.description_en ?? null,
        priceMinor: parsed.data.price_minor ?? null,
        currency: parsed.data.currency ?? menu.currency ?? business.currency,
        calories: parsed.data.calories ?? null,
        allergens: parsed.data.allergens ?? [],
        tags: parsed.data.tags ?? [],
        availability: parsed.data.availability ?? 'AVAILABLE',
        isFeatured: parsed.data.is_featured ?? false,
        sortOrder: parsed.data.sort_order ?? 0,
      },
      select: {
        itemCode: true,
        nameAr: true,
        nameEn: true,
        priceMinor: true,
        currency: true,
        availability: true,
      },
    });

    await recordAudit({
      action: 'item.created',
      entity: 'menu_item',
      businessId: business.id,
      metadata: { apiClientId: credential.clientId, itemCode: item.itemCode, menuKey },
    });
    invalidateProfile(business.publicId);

    return NextResponse.json(
      { data: { ...item, publication: 'draft' } },
      { status: 201, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
