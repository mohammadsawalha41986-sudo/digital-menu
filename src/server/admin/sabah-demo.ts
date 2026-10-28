import { prisma } from '@/server/db/client';
import { SABAH_CATEGORIES, SABAH_PROFILE, SABAH_BRAND } from './sabah-demo-data';

/**
 * Install the Sabah El Lail demo restaurant end-to-end.
 *
 * The same logic the dev-time `prisma/seed-sabah.ts` wraps around, exported
 * through the admin API (POST /api/admin/install-sabah-demo) because the
 * standalone release bundle has no `tsx` or Prisma CLI to run a seed script
 * from a Railway shell. Repeat invocations converge: every write is an
 * upsert keyed on a natural unique column, so pressing the button twice
 * leaves exactly the same rows a single press does.
 *
 * This never deletes existing businesses, never changes another tenant's
 * data, and only runs when the caller is a SUPER_ADMIN (enforced at the
 * route).
 */

export interface InstalledDemo {
  publicId: string;
  businessId: string;
  categoryCount: number;
  itemCount: number;
}

async function upsertImageByUrl(
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

export async function installSabahDemo(staffId: string): Promise<InstalledDemo> {
  const business = await prisma.business.upsert({
    where: { publicId: SABAH_PROFILE.publicId },
    update: SABAH_PROFILE.payload,
    create: { publicId: SABAH_PROFILE.publicId, ...SABAH_PROFILE.payload },
  });

  const logo = await upsertImageByUrl(
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

  let itemCount = 0;

  for (const [categoryIndex, category] of SABAH_CATEGORIES.entries()) {
    let categoryImageMediaId: string | null = null;
    if (category.image) {
      const media = await upsertImageByUrl(
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
      itemCount += 1;
    }
  }

  // Publish atomically. A menu observed without a current version is invisible
  // to visitors, which would make the whole install look broken.
  await prisma.$transaction(async (tx) => {
    const version = await tx.menuVersion.upsert({
      where: { menuId_version: { menuId: menu.id, version: 1 } },
      update: {},
      create: {
        menuId: menu.id,
        version: 1,
        publishedAt: new Date(),
        publishedById: staffId,
        notes: 'One-click Sabah El Lail demo install.',
      },
    });

    await tx.menu.update({
      where: { id: menu.id },
      data: { currentVersionId: version.id },
    });
  });

  return {
    publicId: SABAH_PROFILE.publicId,
    businessId: business.id,
    categoryCount: SABAH_CATEGORIES.length,
    itemCount,
  };
}
