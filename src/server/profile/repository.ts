import { parsePublicId } from '@/lib/public-id';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import { prisma } from '@/server/db/client';
import type { PublicProfile } from './types';

/**
 * Public profile resolution — the read side of the permanent-QR architecture
 * (master spec §10, §48, §166; GOALS I1, I2).
 *
 * The chain is:
 *
 *   QR → /m/{publicId} → Business → currently published menu versions
 *      → template + brand → rendered experience
 *
 * Nothing in that chain is encoded in the QR beyond `publicId`. Changing a
 * price, a template, a brand colour or a PDF changes what the last steps
 * return; the first two steps are untouched, which is precisely why the QR
 * never needs regenerating.
 *
 * This module is also the boundary where an unauthenticated visitor meets the
 * database, so it: validates the identifier before querying, selects only
 * publishable columns, and filters on `status: ACTIVE` so draft and disabled
 * businesses are not publicly readable.
 */

export async function getPublicProfile(rawPublicId: string): Promise<PublicProfile | null> {
  const publicId = parsePublicId(rawPublicId);

  // Reject malformed identifiers in the application layer rather than handing
  // arbitrary strings to the data layer (master spec §127).
  if (!publicId) return null;

  const business = await prisma.business.findFirst({
    where: { publicId, status: 'ACTIVE' },
    select: {
      publicId: true,
      type: true,
      defaultLocale: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      descriptionEn: true,
      templateKey: true,
      variantKey: true,
      brandTheme: {
        select: {
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
        },
      },
    },
  });

  if (!business) return null;

  return {
    publicId: business.publicId,
    businessType: business.type,
    defaultLocale: isLocale(business.defaultLocale) ? business.defaultLocale : DEFAULT_LOCALE,
    nameAr: business.nameAr,
    nameEn: business.nameEn,
    descriptionAr: business.descriptionAr,
    descriptionEn: business.descriptionEn,
    templateKey: business.templateKey,
    variantKey: business.variantKey,
    brand: business.brandTheme ?? DEFAULT_BRAND,
    menus: business.menus.map((menu) => ({
      key: menu.key,
      titleAr: menu.titleAr,
      titleEn: menu.titleEn,
      publishedVersion: menu.currentVersion?.version ?? null,
      publishedAt: menu.currentVersion?.publishedAt ?? null,
    })),
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
