import { prisma } from '@/server/db/client';
import { requireTenantContext, type AuthenticatedUser } from '@/server/tenancy/context';
import { paletteContrast } from '@/server/brand/identity';
import { hasPublishedHours, parseWorkingHours } from '@/server/business/hours';
import { pendingChanges } from '@/server/menus/versioning';
import { evaluateHealth, scoreHealth, type HealthInput, type HealthReport } from './checks';

/**
 * Gathers everything Profile Health needs, in as few queries as the shape
 * allows, and hands it to the pure checks.
 *
 * The split is deliberate: this file knows about Prisma and nothing about what
 * counts as a problem; `checks.ts` knows what counts as a problem and nothing
 * about Prisma. That is what lets the rules be exhaustively tested in an
 * environment with no database.
 */

/** Names close enough to be worth a second look — never merged automatically. */
function findDuplicateNames(items: { nameAr: string; nameEn: string | null }[]): string[] {
  const seen = new Map<string, number>();

  for (const item of items) {
    const key = (item.nameEn ?? item.nameAr).trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .slice(0, 10);
}

export async function getProfileHealth(
  user: AuthenticatedUser,
  businessId: string,
): Promise<HealthReport & { businessName: string; publicId: string }> {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: context.businessId },
    select: {
      id: true,
      publicId: true,
      status: true,
      type: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      descriptionEn: true,
      logoMediaId: true,
      ogMediaId: true,
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
      workingHours: true,
      indexProfile: true,
      metaTitleAr: true,
      metaDescriptionAr: true,
      brandTheme: true,
      branches: { select: { id: true, addressAr: true, addressEn: true } },
      menus: {
        select: {
          id: true,
          key: true,
          currentVersionId: true,
          categories: {
            select: { key: true, _count: { select: { items: true } } },
          },
        },
      },
      // Links and files are the same table: a LINK row carries a URL, a FILE
      // row carries versions. Both are only public when marked so.
      publicFiles: {
        where: { isPublic: true },
        select: { id: true, kind: true, titleAr: true, titleEn: true, externalUrl: true },
      },
    },
  });

  const items = await prisma.menuItem.findMany({
    where: { businessId: context.businessId },
    select: {
      itemCode: true,
      nameAr: true,
      nameEn: true,
      priceMinor: true,
      calories: true,
      descriptionAr: true,
      availability: true,
      isFeatured: true,
      image: { select: { id: true, altAr: true, altEn: true } },
    },
  });

  // One publish-comparison per menu, so "edits not live yet" is a fact rather
  // than a guess. Read-only.
  const pending = await Promise.all(
    business.menus.map(async (menu) => {
      if (!menu.currentVersionId) return { id: menu.id, changed: false };
      try {
        const result = await pendingChanges(prisma, menu.id);
        return { id: menu.id, changed: result.hasChanges };
      } catch {
        return { id: menu.id, changed: false };
      }
    }),
  );

  const theme = business.brandTheme;

  const input: HealthInput = {
    businessId: business.id,
    publicId: business.publicId,
    status: business.status,
    type: business.type,
    nameAr: business.nameAr,
    nameEn: business.nameEn,
    descriptionAr: business.descriptionAr,
    descriptionEn: business.descriptionEn,

    hasLogo: business.logoMediaId !== null,
    hasOgImage: business.ogMediaId !== null,
    brandContrast: theme
      ? paletteContrast({
          primary: theme.colorPrimary,
          secondary: theme.colorSecondary,
          accent: theme.colorAccent,
          background: theme.colorBackground,
          surface: theme.colorSurface,
          text: theme.colorText,
          muted: theme.colorMuted,
          border: theme.colorBorder,
        })
      : null,

    phone: business.phone,
    whatsapp: business.whatsapp,
    email: business.email,
    googleMapsUrl: business.googleMapsUrl,
    addressAr: business.addressAr,
    socialCount: [
      business.website,
      business.instagram,
      business.tiktok,
      business.facebook,
      business.linkedin,
      business.youtube,
    ].filter(Boolean).length,
    hasWorkingHours: hasPublishedHours(parseWorkingHours(business.workingHours)),

    indexProfile: business.indexProfile,
    metaTitleAr: business.metaTitleAr,
    metaDescriptionAr: business.metaDescriptionAr,

    branchCount: business.branches.length,
    branchesMissingAddress: business.branches.filter(
      (branch) => !branch.addressAr && !branch.addressEn,
    ).length,

    menus: business.menus.map((menu) => ({
      id: menu.id,
      key: menu.key,
      isPublished: menu.currentVersionId !== null,
      hasUnpublishedChanges: pending.find((entry) => entry.id === menu.id)?.changed ?? false,
      categoryCount: menu.categories.length,
      emptyCategories: menu.categories
        .filter((category) => category._count.items === 0)
        .map((category) => category.key),
    })),

    items: items.map((item) => ({
      itemCode: item.itemCode,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      priceMinor: item.priceMinor,
      calories: item.calories,
      hasImage: item.image !== null,
      hasImageAlt: Boolean(item.image?.altAr || item.image?.altEn),
      descriptionAr: item.descriptionAr,
      availability: item.availability,
      isFeatured: item.isFeatured,
    })),

    duplicateItemNames: findDuplicateNames(items),
    // Link checking is a separate concern with its own schedule; until it runs,
    // links are honestly reported as unchecked rather than assumed working.
    externalLinks: business.publicFiles
      .filter((file) => file.kind === 'LINK' && file.externalUrl)
      .map((file) => ({
        label: file.titleEn ?? file.titleAr,
        url: file.externalUrl as string,
        status: 'unchecked' as const,
      })),
    publicFileCount: business.publicFiles.filter((file) => file.kind !== 'LINK').length,
  };

  return {
    ...scoreHealth(evaluateHealth(input)),
    businessName: business.nameEn ?? business.nameAr,
    publicId: business.publicId,
  };
}
