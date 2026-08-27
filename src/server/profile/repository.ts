import { parsePublicId } from '@/lib/public-id';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import { prisma } from '@/server/db/client';
import { getStorage } from '@/server/storage';
import type {
  PublicCategory,
  PublicDownload,
  PublicImage,
  PublicItem,
  PublicMenu,
  PublicProfile,
} from './types';

/**
 * Public profile resolution — the read side of the permanent-QR architecture
 * (master spec §10, §48, §166; GOALS I1, I2).
 *
 *   QR → /m/{publicId}[/b/{branchKey}] → Business → published menus
 *      → template + brand → rendered experience
 *
 * Nothing in that chain is encoded in the QR beyond `publicId` (and, for a
 * branch code, the branch key). Changing a price, a template, a brand colour
 * or a PDF changes what the later steps return; the first steps are untouched,
 * which is why a printed QR never needs regenerating.
 *
 * This is also where an unauthenticated visitor meets the database, so it
 * validates the identifier before querying, selects only publishable columns,
 * and filters out everything not meant to be public.
 */

export interface GetPublicProfileOptions {
  /** Branch key from `/m/{publicId}/b/{branchKey}`, when present. */
  branchKey?: string | null;
}

export async function getPublicProfile(
  rawPublicId: string,
  options: GetPublicProfileOptions = {},
): Promise<PublicProfile | null> {
  const publicId = parsePublicId(rawPublicId);

  // Reject malformed identifiers in the application layer rather than handing
  // arbitrary strings to the data layer (master spec §127).
  if (!publicId) return null;

  const business = await prisma.business.findFirst({
    where: { publicId, status: 'ACTIVE' },
    select: {
      id: true,
      publicId: true,
      type: true,
      defaultLocale: true,
      currency: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      descriptionEn: true,
      templateKey: true,
      variantKey: true,
      showPlatformFooter: true,
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
      indexProfile: true,
      metaTitleAr: true,
      metaTitleEn: true,
      metaDescriptionAr: true,
      metaDescriptionEn: true,
      logo: { select: MEDIA_SELECT },
      ogImage: { select: MEDIA_SELECT },
      brandTheme: { select: BRAND_SELECT },
      branches: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
        select: {
          key: true,
          nameAr: true,
          nameEn: true,
          addressAr: true,
          addressEn: true,
          phone: true,
          whatsapp: true,
          googleMapsUrl: true,
          workingHours: true,
        },
      },
      publicFiles: {
        // Only rows staff explicitly published reach a visitor (§108).
        where: { isPublic: true },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
        select: {
          key: true,
          kind: true,
          titleAr: true,
          titleEn: true,
          descriptionAr: true,
          descriptionEn: true,
          externalUrl: true,
          allowDownload: true,
          currentVersion: { select: { sizeBytes: true, contentType: true } },
        },
      },
      menus: {
        // Only menus that are active *and* carry a published version reach a
        // visitor. A draft menu is invisible even though its rows exist.
        where: { status: 'ACTIVE', currentVersion: { isNot: null } },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
        select: {
          key: true,
          titleAr: true,
          titleEn: true,
          currentVersion: { select: { version: true, publishedAt: true } },
          categories: {
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
            select: {
              key: true,
              nameAr: true,
              nameEn: true,
              descriptionAr: true,
              descriptionEn: true,
              isFeatured: true,
              image: { select: MEDIA_SELECT },
              items: {
                // HIDDEN items never reach the public profile (§83).
                where: { availability: { not: 'HIDDEN' } },
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
                  servingSizeAr: true,
                  servingSizeEn: true,
                  ingredientsAr: true,
                  ingredientsEn: true,
                  allergens: true,
                  tags: true,
                  isFeatured: true,
                  availability: true,
                  image: { select: MEDIA_SELECT },
                  gallery: {
                    orderBy: { sortOrder: 'asc' },
                    select: { media: { select: MEDIA_SELECT } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!business) return null;

  // A branch key that does not resolve is treated as "no branch" rather than a
  // 404: a visitor scanning a branch QR after that branch was renamed should
  // still see the business.
  const activeBranch = options.branchKey
    ? (business.branches.find((branch) => branch.key === options.branchKey) ?? null)
    : null;

  const overrides = activeBranch ? await loadBranchOverrides(business.id, activeBranch.key) : null;

  return {
    publicId: business.publicId,
    businessType: business.type,
    defaultLocale: isLocale(business.defaultLocale) ? business.defaultLocale : DEFAULT_LOCALE,
    currency: business.currency,
    nameAr: business.nameAr,
    nameEn: business.nameEn,
    descriptionAr: business.descriptionAr,
    descriptionEn: business.descriptionEn,
    logo: toImage(business.logo),
    templateKey: business.templateKey,
    variantKey: business.variantKey,
    brand: business.brandTheme ?? DEFAULT_BRAND,
    showPlatformFooter: business.showPlatformFooter,
    contact: {
      // A branch view prefers the branch's own contact details.
      phone: activeBranch?.phone ?? business.phone,
      whatsapp: activeBranch?.whatsapp ?? business.whatsapp,
      email: business.email,
      website: business.website,
      instagram: business.instagram,
      tiktok: business.tiktok,
      facebook: business.facebook,
      linkedin: business.linkedin,
      youtube: business.youtube,
      googleMapsUrl: activeBranch?.googleMapsUrl ?? business.googleMapsUrl,
      addressAr: activeBranch?.addressAr ?? business.addressAr,
      addressEn: activeBranch?.addressEn ?? business.addressEn,
      workingHours: activeBranch?.workingHours ?? business.workingHours,
    },
    seo: {
      indexProfile: business.indexProfile,
      metaTitleAr: business.metaTitleAr,
      metaTitleEn: business.metaTitleEn,
      metaDescriptionAr: business.metaDescriptionAr,
      metaDescriptionEn: business.metaDescriptionEn,
      ogImage: toImage(business.ogImage),
    },
    branches: business.branches.map((branch) => ({
      key: branch.key,
      nameAr: branch.nameAr,
      nameEn: branch.nameEn,
      addressAr: branch.addressAr,
      addressEn: branch.addressEn,
      phone: branch.phone,
      whatsapp: branch.whatsapp,
      googleMapsUrl: branch.googleMapsUrl,
      workingHours: branch.workingHours,
    })),
    activeBranchKey: activeBranch?.key ?? null,
    menus: business.menus.map((menu): PublicMenu => toMenu(menu, overrides)),
    // Offers arrive in Phase 5; the shape exists now so templates can be
    // written against a stable contract.
    offers: [],
    downloads: business.publicFiles.flatMap((file): PublicDownload[] => {
      if (file.kind === 'LINK') {
        return file.externalUrl
          ? [
              {
                key: file.key,
                titleAr: file.titleAr,
                titleEn: file.titleEn,
                descriptionAr: file.descriptionAr,
                descriptionEn: file.descriptionEn,
                kind: 'link' as const,
                url: file.externalUrl,
                fileSizeBytes: null,
                contentType: null,
                allowDownload: true,
              },
            ]
          : [];
      }

      // A published file with no current version would render as a broken
      // link; drop it instead (§120).
      if (!file.currentVersion) return [];

      return [
        {
          key: file.key,
          titleAr: file.titleAr,
          titleEn: file.titleEn,
          descriptionAr: file.descriptionAr,
          descriptionEn: file.descriptionEn,
          kind: 'file' as const,
          // The permanent per-file path — never a storage URL (§48).
          url: `/f/${business.publicId}/${file.key}`,
          fileSizeBytes: file.currentVersion.sizeBytes,
          contentType: file.currentVersion.contentType,
          allowDownload: file.allowDownload,
        },
      ];
    }),
  };
}

const MEDIA_SELECT = {
  storageKey: true,
  altAr: true,
  altEn: true,
  width: true,
  height: true,
} as const;

const BRAND_SELECT = {
  colorPrimary: true,
  colorSecondary: true,
  colorAccent: true,
  colorBackground: true,
  colorSurface: true,
  colorText: true,
  colorMuted: true,
  colorBorder: true,
  fontHeading: true,
  fontBody: true,
  radiusScale: true,
} as const;

interface MediaRow {
  storageKey: string;
  altAr: string | null;
  altEn: string | null;
  width: number | null;
  height: number | null;
}

function toImage(media: MediaRow | null | undefined): PublicImage | null {
  if (!media) return null;

  return {
    // The storage key never reaches the browser directly; the provider decides
    // what a public URL looks like (§56).
    url: getStorage().publicUrl(media.storageKey),
    altAr: media.altAr,
    altEn: media.altEn,
    width: media.width,
    height: media.height,
  };
}

type OverrideMap = Map<string, { priceMinor: number | null; availability: string | null }>;

/**
 * Loads branch deviations keyed by item code. Kept as a separate query rather
 * than a nested include so the shared-menu case — the common one — costs
 * nothing (§86).
 */
async function loadBranchOverrides(businessId: string, branchKey: string): Promise<OverrideMap> {
  const rows = await prisma.branchItemOverride.findMany({
    where: {
      branch: { businessId, key: branchKey },
      // Scope through the item's business too: an override must never be able
      // to reference another tenant's item.
      item: { businessId },
    },
    select: {
      priceMinor: true,
      availability: true,
      item: { select: { itemCode: true } },
    },
  });

  return new Map(
    rows.map((row) => [
      row.item.itemCode,
      { priceMinor: row.priceMinor, availability: row.availability },
    ]),
  );
}

interface MenuRow {
  key: string;
  titleAr: string;
  titleEn: string | null;
  currentVersion: { version: number; publishedAt: Date | null } | null;
  categories: CategoryRow[];
}

interface CategoryRow {
  key: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  isFeatured: boolean;
  image: MediaRow | null;
  items: ItemRow[];
}

interface ItemRow {
  itemCode: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  priceMinor: number | null;
  currency: string;
  calories: number | null;
  servingSizeAr: string | null;
  servingSizeEn: string | null;
  ingredientsAr: string | null;
  ingredientsEn: string | null;
  allergens: string[];
  tags: string[];
  isFeatured: boolean;
  availability: string;
  image: MediaRow | null;
  gallery: { media: MediaRow }[];
}

function toMenu(menu: MenuRow, overrides: OverrideMap | null): PublicMenu {
  return {
    key: menu.key,
    titleAr: menu.titleAr,
    titleEn: menu.titleEn,
    publishedVersion: menu.currentVersion?.version ?? null,
    publishedAt: menu.currentVersion?.publishedAt ?? null,
    categories: menu.categories
      .map((category): PublicCategory => toCategory(category, overrides))
      // A category whose every item is hidden would render as an empty heading;
      // drop it rather than show a broken section (§120).
      .filter((category) => category.items.length > 0),
  };
}

function toCategory(category: CategoryRow, overrides: OverrideMap | null): PublicCategory {
  return {
    key: category.key,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    descriptionAr: category.descriptionAr,
    descriptionEn: category.descriptionEn,
    image: toImage(category.image),
    isFeatured: category.isFeatured,
    items: category.items
      .map((item) => toItem(item, overrides))
      .filter((item): item is PublicItem => item !== null),
  };
}

function toItem(item: ItemRow, overrides: OverrideMap | null): PublicItem | null {
  const override = overrides?.get(item.itemCode);
  const availability = override?.availability ?? item.availability;

  // A branch may hide an item the business as a whole still serves.
  if (availability === 'HIDDEN') return null;

  return {
    code: item.itemCode,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    descriptionAr: item.descriptionAr,
    descriptionEn: item.descriptionEn,
    priceMinor: override?.priceMinor ?? item.priceMinor,
    currency: item.currency,
    calories: item.calories,
    servingSizeAr: item.servingSizeAr,
    servingSizeEn: item.servingSizeEn,
    ingredientsAr: item.ingredientsAr,
    ingredientsEn: item.ingredientsEn,
    allergens: item.allergens,
    tags: item.tags,
    isFeatured: item.isFeatured,
    isUnavailable: availability === 'UNAVAILABLE',
    image: toImage(item.image),
    gallery: item.gallery
      .map((entry) => toImage(entry.media))
      .filter((image): image is PublicImage => image !== null),
  };
}

/**
 * Used when a business has no brand theme yet. Mirrors the neutral defaults in
 * tokens.css so an un-branded profile is still legible rather than unstyled.
 */
const DEFAULT_BRAND: PublicProfile['brand'] = {
  colorPrimary: '#1f2421',
  colorSecondary: '#49a078',
  colorAccent: '#c9a227',
  colorBackground: '#fbf9f5',
  colorSurface: '#ffffff',
  colorText: '#16181a',
  colorMuted: '#6b7280',
  colorBorder: '#e5e1d8',
  fontHeading: 'system-serif',
  fontBody: 'system-sans',
  radiusScale: 'md',
};
