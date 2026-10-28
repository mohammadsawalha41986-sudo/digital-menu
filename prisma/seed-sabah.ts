/**
 * Sabah El Lail seed — a real-looking Riyadh restaurant used to demonstrate
 * the Street Food template end-to-end at dev time.
 *
 * Dev-time wrapper around the shared install logic in
 * `src/server/admin/sabah-demo.ts`; the content lives in
 * `src/server/admin/sabah-demo-data.ts` so the production admin API
 * (`/api/admin/install-sabah-demo`) seeds exactly the same restaurant
 * from exactly the same source of truth.
 */
import type { PrismaClient } from '../src/generated/prisma/client';
import {
  SABAH_CATEGORIES,
  SABAH_PROFILE,
  SABAH_BRAND,
} from '../src/server/admin/sabah-demo-data';

async function upsertImageByUrl(
  prisma: PrismaClient,
  businessId: string,
  url: string,
  kind: 'ITEM_IMAGE' | 'CATEGORY_IMAGE' | 'LOGO',
  altAr: string,
  altEn: string | null = null,
) {
  const storageKey = `external/sabah/${url.replace(/[^a-zA-Z0-9]+/g, '_')}`;
  return prisma.media.upsert({
    where: { storageKey },
    update: { sourceUrl: url, altAr, altEn, businessId, kind },
    create: {
      storageKey,
      sourceUrl: url,
      businessId,
      kind,
      contentType: 'image/png',
      sizeBytes: 0,
      altAr,
      altEn,
    },
  });
}

export async function seedSabahElLail(prisma: PrismaClient, staffId: string) {
  const business = await prisma.business.upsert({
    where: { publicId: SABAH_PROFILE.publicId },
    update: SABAH_PROFILE.payload,
    create: { publicId: SABAH_PROFILE.publicId, ...SABAH_PROFILE.payload },
  });

  const logo = await upsertImageByUrl(
    prisma,
    business.id,
    '/sabah/assets/menu/logo_crop.png',
    'LOGO',
    'شعار مطعم صباح الليل',
    'Sabah El Lail logo',
  );
  await prisma.business.update({
    where: { id: business.id },
    data: { logoMediaId: logo.id },
  });

  await prisma.brandTheme.upsert({
    where: { businessId: business.id },
    update: SABAH_BRAND,
    create: { businessId: business.id, ...SABAH_BRAND },
  });

  const menu = await prisma.menu.upsert({
    where: { businessId_key: { businessId: business.id, key: SABAH_PROFILE.menuKey } },
    update: {},
    create: {
      businessId: business.id,
      key: SABAH_PROFILE.menuKey,
      status: 'ACTIVE',
      titleAr: 'المنيو الرئيسي',
      titleEn: 'Main Menu',
      sortOrder: 0,
    },
  });

  for (const [categoryIndex, category] of SABAH_CATEGORIES.entries()) {
    let categoryImageMediaId: string | null = null;
    if (category.image) {
      const media = await upsertImageByUrl(
        prisma,
        business.id,
        category.image,
        'CATEGORY_IMAGE',
        category.nameAr,
        category.nameEn,
      );
      categoryImageMediaId = media.id;
    }

    const categoryRow = await prisma.menuCategory.upsert({
      where: { menuId_key: { menuId: menu.id, key: category.key } },
      update: {
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        descriptionAr: category.descriptionAr ?? null,
        descriptionEn: category.descriptionEn ?? null,
        sortOrder: categoryIndex,
        imageMediaId: categoryImageMediaId,
      },
      create: {
        menuId: menu.id,
        businessId: business.id,
        key: category.key,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        descriptionAr: category.descriptionAr ?? null,
        descriptionEn: category.descriptionEn ?? null,
        sortOrder: categoryIndex,
        imageMediaId: categoryImageMediaId,
      },
    });

    for (const [itemIndex, item] of category.items.entries()) {
      let itemImageMediaId: string | null = null;
      if (item.image) {
        const media = await upsertImageByUrl(
          prisma,
          business.id,
          item.image,
          'ITEM_IMAGE',
          item.nameAr,
          item.nameEn,
        );
        itemImageMediaId = media.id;
      }

      await prisma.menuItem.upsert({
        where: { businessId_itemCode: { businessId: business.id, itemCode: item.code } },
        update: {
          categoryId: categoryRow.id,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          descriptionAr: item.descriptionAr ?? null,
          descriptionEn: item.descriptionEn ?? null,
          priceMinor: item.priceMinor,
          calories: item.calories ?? null,
          tags: item.tags ?? [],
          isFeatured: item.featured ?? false,
          imageMediaId: itemImageMediaId,
          sortOrder: itemIndex,
        },
        create: {
          businessId: business.id,
          categoryId: categoryRow.id,
          itemCode: item.code,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          descriptionAr: item.descriptionAr ?? null,
          descriptionEn: item.descriptionEn ?? null,
          priceMinor: item.priceMinor,
          currency: 'SAR',
          calories: item.calories ?? null,
          tags: item.tags ?? [],
          isFeatured: item.featured ?? false,
          availability: 'AVAILABLE',
          sortOrder: itemIndex,
          imageMediaId: itemImageMediaId,
        },
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    const version = await tx.menuVersion.upsert({
      where: { menuId_version: { menuId: menu.id, version: 1 } },
      update: {},
      create: {
        menuId: menu.id,
        version: 1,
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        publishedById: staffId,
        notes: 'Seed publication — Sabah El Lail',
      },
    });

    await tx.menu.update({
      where: { id: menu.id },
      data: { currentVersionId: version.id },
    });
  });

  return business;
}
