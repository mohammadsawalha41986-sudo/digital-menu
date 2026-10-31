import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { requireTenantContext, TenantAccessError, type AuthenticatedUser } from '@/server/tenancy/context';
import { ValidationError } from './business-service';

/**
 * Hero banners: the pictures a restaurant puts at the top of its menu, in
 * its own order. Removing a banner never deletes its photo; the photo stays
 * in the library, and other uses of it are untouched.
 */

export const MAX_BANNERS = 8;

export interface BannerFields {
  headingAr?: string | null;
  headingEn?: string | null;
  subheadingAr?: string | null;
  subheadingEn?: string | null;
  ctaLabelAr?: string | null;
  ctaLabelEn?: string | null;
  ctaUrl?: string | null;
  overlay?: number;
  isVisible?: boolean;
  focalX?: number | null;
  focalY?: number | null;
  mobileFocalX?: number | null;
  mobileFocalY?: number | null;
}

const text = (value: string | null | undefined, max: number) => {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed.slice(0, max) : null;
};

const point = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) ? null : Math.min(1, Math.max(0, value));

/** A link a banner button may carry: a web address, a phone number, or a menu section. */
export function safeBannerLink(value: string | null | undefined): string | null {
  const link = value?.trim() ?? '';
  if (!link) return null;
  if (/^https:\/\/[^\s]+$/i.test(link) || /^tel:\+?[0-9 ()-]{5,20}$/.test(link) || /^#[a-z0-9-]{1,64}$/i.test(link)) {
    return link;
  }
  throw new ValidationError('The button link must start with https://, tel:, or # (a menu section)');
}

async function bannerOf(businessId: string, id: string) {
  const banner = await prisma.heroBanner.findFirst({ where: { id, businessId } });
  if (!banner) throw new TenantAccessError('Banner not found');
  return banner;
}

export async function listHeroBanners(user: AuthenticatedUser, businessId: string) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');
  return prisma.heroBanner.findMany({
    where: { businessId: context.businessId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

/** A photo from this restaurant's library becomes the last banner. */
export async function addHeroBanner(user: AuthenticatedUser, businessId: string, mediaId: string) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const media = await prisma.media.findFirst({
    where: { id: mediaId, businessId: context.businessId },
    select: { id: true, contentType: true },
  });
  if (!media) throw new TenantAccessError('Media not found');
  if (!media.contentType.startsWith('image/')) throw new ValidationError('A banner must be a photo');

  const existing = await prisma.heroBanner.findMany({
    where: { businessId: context.businessId },
    select: { sortOrder: true },
  });
  if (existing.length >= MAX_BANNERS) throw new ValidationError(`At most ${MAX_BANNERS} banners`);

  const banner = await prisma.heroBanner.create({
    data: {
      businessId: context.businessId,
      mediaId: media.id,
      sortOrder: existing.reduce((last, row) => Math.max(last, row.sortOrder + 1), 0),
    },
  });
  await recordAudit({
    action: 'hero_banner.changed',
    entity: 'business',
    entityId: context.businessId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { added: banner.id },
  });
  return banner;
}

export async function updateHeroBanner(user: AuthenticatedUser, businessId: string, id: string, fields: BannerFields) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  await bannerOf(context.businessId, id);
  const overlay = Math.round(Number(fields.overlay ?? 0));
  if (!Number.isFinite(overlay) || overlay < 0 || overlay > 60) throw new ValidationError('Overlay must be between 0 and 60');

  const banner = await prisma.heroBanner.update({
    where: { id },
    data: {
      headingAr: text(fields.headingAr, 120),
      headingEn: text(fields.headingEn, 120),
      subheadingAr: text(fields.subheadingAr, 240),
      subheadingEn: text(fields.subheadingEn, 240),
      ctaLabelAr: text(fields.ctaLabelAr, 40),
      ctaLabelEn: text(fields.ctaLabelEn, 40),
      ctaUrl: safeBannerLink(fields.ctaUrl),
      overlay,
      isVisible: fields.isVisible ?? true,
      focalX: point(fields.focalX),
      focalY: point(fields.focalY),
      mobileFocalX: point(fields.mobileFocalX),
      mobileFocalY: point(fields.mobileFocalY),
    },
  });
  await recordAudit({
    action: 'hero_banner.changed',
    entity: 'business',
    entityId: context.businessId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { updated: id },
  });
  return banner;
}

/** Up, down, or to the front (the banner shown first). */
export async function moveHeroBanner(
  user: AuthenticatedUser,
  businessId: string,
  id: string,
  to: 'up' | 'down' | 'first',
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  await bannerOf(context.businessId, id);
  const order = (
    await prisma.heroBanner.findMany({
      where: { businessId: context.businessId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    })
  ).map((row) => row.id);

  const index = order.indexOf(id);
  const next = [...order];
  if (to === 'first') {
    next.splice(index, 1);
    next.unshift(id);
  } else {
    const target = to === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
  }

  await prisma.$transaction(
    next.map((bannerId, sortOrder) => prisma.heroBanner.update({ where: { id: bannerId }, data: { sortOrder } })),
  );
}

/** Removes the banner only; its photo stays in the library. */
export async function deleteHeroBanner(user: AuthenticatedUser, businessId: string, id: string) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  await bannerOf(context.businessId, id);
  await prisma.heroBanner.delete({ where: { id } });
  await recordAudit({
    action: 'hero_banner.changed',
    entity: 'business',
    entityId: context.businessId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { removed: id },
  });
}

export async function setHeroInterval(user: AuthenticatedUser, businessId: string, seconds: number) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const value = Math.round(seconds);
  if (!Number.isFinite(value) || value < 3 || value > 15) throw new ValidationError('Choose between 3 and 15 seconds');
  await prisma.business.update({ where: { id: context.businessId }, data: { heroIntervalSec: value } });
}
