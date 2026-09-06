/**
 * Demo imagery.
 *
 * The demo businesses shipped without a single image between them: no logo, no
 * cover, no item photography. Every template renders image slots, so what a
 * visitor actually saw was a menu of empty frames — which is the difference
 * between a product and a scaffold.
 *
 * A repository cannot carry licensed photography, and inventing photorealistic
 * dishes would be worse than nothing: a menu that shows a picture of food the
 * kitchen does not serve is a lie told to a customer. So the demos are given
 * *brand artwork* instead — abstract compositions drawn from each business's
 * own palette and the geometry of its trade — and the alt text says so, in
 * both languages, rather than describing a photograph that does not exist.
 *
 * Everything here goes through `storeMedia`, the same path an operator's
 * upload takes, so the demos exercise the real validation, checksum
 * de-duplication and derivative generation. Artwork is deterministic, so
 * re-seeding de-duplicates onto the existing rows instead of growing the
 * media table on every run.
 */

import type { PrismaClient } from '../src/generated/prisma/client';
import {
  renderArtwork,
  renderLogo,
  type ArtworkMotif,
  type ArtworkPalette,
} from '../src/server/media/artwork';
import { storeMedia } from '../src/server/media/service';

interface DemoProfile {
  /** Monogram for the logo. */
  initials: string;
  /** The motif the cover and category art are drawn in. */
  motif: ArtworkMotif;
  /** Per-category motifs, so a menu is not four pictures of one idea. */
  categoryMotifs?: Record<string, ArtworkMotif>;
}

/**
 * Keyed by public id rather than by type: two restaurants should not get the
 * same picture, and the point of the demos is that each has its own identity.
 */
const PROFILES: Record<string, DemoProfile> = {
  DEM001: {
    initials: 'DR',
    motif: 'dining',
    categoryMotifs: { starters: 'produce', mains: 'grill', drinks: 'coffee' },
  },
  DEM002: { initials: 'مق', motif: 'coffee' },
  DEM003: {
    initials: 'SA',
    motif: 'dining',
    categoryMotifs: { first: 'produce', main: 'dining' },
  },
  DEM004: {
    initials: 'CR',
    motif: 'coffee',
    categoryMotifs: { espresso: 'coffee', filter: 'produce' },
  },
  DEM005: { initials: 'SB', motif: 'grill', categoryMotifs: { burgers: 'burger' } },
  DEM006: {
    initials: 'NB',
    motif: 'bakery',
    categoryMotifs: { bread: 'bakery', pastry: 'pastry', sweets: 'pastry' },
  },
  DEM007: {
    initials: 'NS',
    motif: 'salon',
    categoryMotifs: { hair: 'salon', care: 'pastry' },
  },
  DRAFT1: { initials: 'DB', motif: 'bakery' },
};

const FALLBACK_PALETTE: ArtworkPalette = {
  primary: '#20303A',
  secondary: '#4A6070',
  accent: '#C08A4A',
  background: '#F6F4F0',
};

/** Aspect ratios chosen to match what each slot is actually cropped to. */
const COVER = { width: 1600, height: 900 } as const;
const CATEGORY = { width: 1200, height: 800 } as const;
const ITEM = { width: 900, height: 900 } as const;

function paletteOf(theme: {
  colorPrimary: string | null;
  colorSecondary: string | null;
  colorAccent: string | null;
  colorBackground: string | null;
} | null): ArtworkPalette {
  if (!theme) return FALLBACK_PALETTE;

  return {
    primary: theme.colorPrimary ?? FALLBACK_PALETTE.primary,
    secondary: theme.colorSecondary ?? FALLBACK_PALETTE.secondary,
    accent: theme.colorAccent ?? FALLBACK_PALETTE.accent,
    background: theme.colorBackground ?? FALLBACK_PALETTE.background,
  };
}

/**
 * Alt text, authored in both languages.
 *
 * It names the artwork as artwork. A screen-reader user told "photograph of
 * truffle velouté" when the image is an abstract composition has been given
 * false information, which is worse than being given none.
 */
function altPair(kind: 'logo' | 'cover' | 'category' | 'item' | 'offer', ar: string, en: string) {
  switch (kind) {
    case 'logo':
      return { altAr: `شعار ${ar}`, altEn: `${en} logo` };
    case 'cover':
      return { altAr: `فن العلامة التجارية لـ${ar}`, altEn: `Brand artwork for ${en}` };
    case 'category':
      return { altAr: `فن تعريفي لقسم ${ar}`, altEn: `Section artwork for ${en}` };
    case 'offer':
      return { altAr: `فن تعريفي لعرض ${ar}`, altEn: `Artwork for the ${en} offer` };
    case 'item':
      return { altAr: `فن تقديمي لـ${ar}`, altEn: `Presentation artwork for ${en}` };
  }
}

export interface ArtworkSummary {
  businesses: number;
  images: number;
}

export async function seedArtwork(prisma: PrismaClient): Promise<ArtworkSummary> {
  const businesses = await prisma.business.findMany({
    select: {
      id: true,
      publicId: true,
      type: true,
      nameAr: true,
      nameEn: true,
      brandTheme: {
        select: {
          colorPrimary: true,
          colorSecondary: true,
          colorAccent: true,
          colorBackground: true,
        },
      },
      menus: {
        select: {
          categories: {
            select: {
              id: true,
              key: true,
              nameAr: true,
              nameEn: true,
              items: { select: { id: true, itemCode: true, nameAr: true, nameEn: true } },
            },
          },
        },
      },
      offers: { select: { id: true, key: true, titleAr: true, titleEn: true } },
    },
  });

  let images = 0;

  for (const business of businesses) {
    const profile = PROFILES[business.publicId];

    // Businesses created by a test or by hand are left alone: inventing a
    // brand for them would make their fixtures unpredictable.
    if (!profile) continue;

    const palette = paletteOf(business.brandTheme);
    const nameAr = business.nameAr;
    const nameEn = business.nameEn ?? business.nameAr;

    const put = async (
      kind: 'LOGO' | 'OG_IMAGE' | 'CATEGORY_IMAGE' | 'ITEM_IMAGE' | 'OFFER_IMAGE',
      bytes: Buffer,
      filename: string,
      alt: { altAr: string; altEn: string },
    ) => {
      const { media, deduplicated } = await storeMedia(business.id, {
        kind,
        altAr: alt.altAr,
        altEn: alt.altEn,
        upload: {
          bytes: new Uint8Array(bytes),
          fileName: filename,
          declaredContentType: filename.endsWith('.png') ? 'image/png' : 'image/webp',
        },
      });

      if (!deduplicated) images += 1;
      return media;
    };

    // --- identity ---------------------------------------------------------
    const logo = await put(
      'LOGO',
      await renderLogo(profile.initials, palette),
      `${business.publicId}-logo.png`,
      altPair('logo', nameAr, nameEn),
    );

    const cover = await put(
      'OG_IMAGE',
      await renderArtwork({
        ...COVER,
        palette,
        motif: profile.motif,
        seed: `${business.publicId}:cover`,
      }),
      `${business.publicId}-cover.webp`,
      altPair('cover', nameAr, nameEn),
    );

    await prisma.business.update({
      where: { id: business.id },
      data: { logoMediaId: logo.id, ogMediaId: cover.id },
    });

    // --- offers -----------------------------------------------------------
    for (const offer of business.offers) {
      const media = await put(
        'OFFER_IMAGE',
        await renderArtwork({
          ...CATEGORY,
          palette,
          motif: profile.motif,
          seed: `${business.publicId}:offer:${offer.key}`,
          intensity: 1.15,
        }),
        `${business.publicId}-offer-${offer.key}.webp`,
        altPair('offer', offer.titleAr, offer.titleEn ?? offer.titleAr),
      );

      await prisma.offer.update({
        where: { id: offer.id },
        data: { imageMediaId: media.id },
      });
    }

    // --- menu -------------------------------------------------------------
    for (const menu of business.menus) {
      for (const category of menu.categories) {
        const motif = profile.categoryMotifs?.[category.key] ?? profile.motif;

        const categoryMedia = await put(
          'CATEGORY_IMAGE',
          await renderArtwork({
            ...CATEGORY,
            palette,
            motif,
            seed: `${business.publicId}:category:${category.key}`,
          }),
          `${business.publicId}-${category.key}.webp`,
          altPair('category', category.nameAr, category.nameEn ?? category.nameAr),
        );

        await prisma.menuCategory.update({
          where: { id: category.id },
          data: { imageMediaId: categoryMedia.id },
        });

        for (const item of category.items) {
          const itemMedia = await put(
            'ITEM_IMAGE',
            await renderArtwork({
              ...ITEM,
              palette,
              motif,
              // The item code is what makes each dish's picture its own.
              seed: `${business.publicId}:item:${item.itemCode}`,
            }),
            `${business.publicId}-${item.itemCode}.webp`,
            altPair('item', item.nameAr, item.nameEn ?? item.nameAr),
          );

          await prisma.menuItem.update({
            where: { id: item.id },
            data: { imageMediaId: itemMedia.id },
          });
        }
      }
    }
  }

  return { businesses: businesses.filter((b) => PROFILES[b.publicId]).length, images };
}
