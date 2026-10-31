import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, publishMenu } from '@/server/admin/business-service';
import {
  addHeroBanner,
  deleteHeroBanner,
  MAX_BANNERS,
  moveHeroBanner,
  setHeroInterval,
  updateHeroBanner,
} from '@/server/admin/hero-banners';
import { getPublicProfile } from '@/server/profile/repository';
import { profileToSabah } from '@/templates/street-food/profile-to-sabah';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import { resolveDatabase } from '../database';

/** Hero banners: chosen, ordered, cropped twice, and shown on the public menu. */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUGS = ['hero-fixture', 'hero-other'];
const EMAILS = ['hero-fixture@example.test', 'hero-other@example.test'];
let businessId = '';
let publicId = '';
let otherMediaId = '';
let mediaIds: string[] = [];
let user = { id: '', role: 'SUPER_ADMIN' as const };
let outsider = { id: '', role: 'STAFF' as const };

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: { in: SLUGS } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

const photo = (owner: string, key: string) =>
  prisma.media.create({
    data: { businessId: owner, kind: 'GALLERY', storageKey: `test/${key}.webp`, contentType: 'image/webp', sizeBytes: 10 },
  });

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await removeFixture();
  user = { id: (await prisma.user.create({ data: { email: EMAILS[0]!, name: 'Hero', role: 'SUPER_ADMIN' } })).id, role: 'SUPER_ADMIN' };
  outsider = { id: (await prisma.user.create({ data: { email: EMAILS[1]!, name: 'O', role: 'STAFF' } })).id, role: 'STAFF' };
  const make = (slug: string) =>
    createBusiness(user, {
      slug,
      type: 'RESTAURANT',
      status: 'ACTIVE',
      defaultLocale: 'ar',
      currency: 'SAR',
      nameAr: 'مطعم',
      nameEn: slug,
    } as Parameters<typeof createBusiness>[1]);
  const business = await make(SLUGS[0]!);
  businessId = business.id;
  publicId = business.publicId;
  const other = await make(SLUGS[1]!);
  otherMediaId = (await photo(other.id, 'other-1')).id;
  mediaIds = await Promise.all(['a', 'b', 'c'].map(async (name) => (await photo(businessId, `hero-${name}`)).id));
  const menu = await prisma.menu.create({ data: { businessId, key: 'main', titleAr: 'المنيو', status: 'DRAFT' } });
  await publishMenu(user, businessId, menu.id);
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('hero banners', () => {
  it('adds this restaurant’s photos only, in order, up to the maximum', async () => {
    for (const id of mediaIds) await addHeroBanner(user, businessId, id);
    await expect(addHeroBanner(user, businessId, otherMediaId)).rejects.toBeInstanceOf(TenantAccessError);
    await expect(addHeroBanner(outsider, businessId, mediaIds[0]!)).rejects.toBeInstanceOf(TenantAccessError);
    const rows = await prisma.heroBanner.findMany({ where: { businessId }, orderBy: { sortOrder: 'asc' } });
    expect(rows.map((row) => row.mediaId)).toEqual(mediaIds);
    expect(MAX_BANNERS).toBeGreaterThanOrEqual(3);
  });

  it('saves text, a safe button link, an overlay and two crop points; refuses unsafe links', async () => {
    const [first] = await prisma.heroBanner.findMany({ where: { businessId }, orderBy: { sortOrder: 'asc' } });
    await updateHeroBanner(user, businessId, first!.id, {
      headingAr: 'عرض الغداء',
      ctaLabelAr: 'اطلب',
      ctaUrl: '#menu-section',
      overlay: 30,
      isVisible: true,
      focalX: 0.2,
      focalY: 0.3,
      mobileFocalX: 0.8,
      mobileFocalY: 0.6,
    });
    await expect(updateHeroBanner(user, businessId, first!.id, { ctaUrl: 'javascript:alert(1)' })).rejects.toThrow(/https/);
    await expect(updateHeroBanner(user, businessId, first!.id, { overlay: 90 })).rejects.toThrow(/Overlay/);
  });

  it('moves a banner to the front and deletes one without touching its photo', async () => {
    const rows = await prisma.heroBanner.findMany({ where: { businessId }, orderBy: { sortOrder: 'asc' } });
    await moveHeroBanner(user, businessId, rows[2]!.id, 'first');
    const after = await prisma.heroBanner.findMany({ where: { businessId }, orderBy: { sortOrder: 'asc' } });
    expect(after.map((row) => row.id)).toEqual([rows[2]!.id, rows[0]!.id, rows[1]!.id]);

    await deleteHeroBanner(user, businessId, rows[1]!.id);
    expect(await prisma.heroBanner.count({ where: { businessId } })).toBe(2);
    expect(await prisma.media.count({ where: { id: rows[1]!.mediaId } })).toBe(1);
  });

  it('shows visible banners on the public menu in order, each crop for its screen, at the chosen pace', async () => {
    const rows = await prisma.heroBanner.findMany({ where: { businessId }, orderBy: { sortOrder: 'asc' } });
    await prisma.heroBanner.update({ where: { id: rows[0]!.id }, data: { isVisible: false } });
    await setHeroInterval(user, businessId, 8);
    await expect(setHeroInterval(user, businessId, 1)).rejects.toThrow(/between 3 and 15/);

    const profile = await getPublicProfile(publicId);
    expect(profile?.heroBanners.map((banner) => banner.id)).toEqual([rows[1]!.id]);
    const banner = profile!.heroBanners[0]!;
    expect([banner.headingAr, banner.overlay, banner.ctaUrl]).toEqual(['عرض الغداء', 30, '#menu-section']);
    expect(banner.image.objectPosition).toBe('20.0% 30.0%');
    expect(banner.mobilePosition).toBe('80.0% 60.0%');

    const sabah = profileToSabah(profile!);
    expect(sabah.heroIntervalMs).toBe(8000);
    expect(sabah.slides).toHaveLength(1);
    expect(sabah.slides[0]).toMatchObject({ headlineAr: 'عرض الغداء', imageMobilePosition: '80.0% 60.0%', overlay: 30 });
  });
});
