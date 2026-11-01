import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, publishMenu } from '@/server/admin/business-service';
import { assignMedia } from '@/server/media/service';
import { getPublicProfile } from '@/server/profile/repository';
import { resetEnvCache } from '@/lib/env';
import { resolveDatabase } from '../database';

/**
 * The welcome figure: a restaurant's own image, pointed at from its profile,
 * shown in the welcome message. Only media the restaurant owns can be used.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'welcome-figure-fixture';
const OTHER_SLUG = 'welcome-figure-other';
const EMAIL = 'welcome-figure@example.test';
const FIGURE_URL = 'https://cdn.example.test/welcome-figure.png';

let user = { id: '', role: 'SUPER_ADMIN' as const };
let businessId = '';
let publicId = '';
let figureId = '';
let otherFigureId = '';
let otherBusinessId = '';

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function makeBusiness(slug: string) {
  return createBusiness(user, {
    slug,
    type: 'RESTAURANT',
    status: 'ACTIVE',
    defaultLocale: 'ar',
    currency: 'SAR',
    nameAr: 'مطعم',
    nameEn: slug,
  } as Parameters<typeof createBusiness>[1]);
}

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await removeFixture();

  const staff = await prisma.user.create({ data: { email: EMAIL, name: 'Welcome figure', role: 'SUPER_ADMIN' } });
  user = { id: staff.id, role: 'SUPER_ADMIN' };

  const business = await makeBusiness(SLUG);
  businessId = business.id;
  publicId = business.publicId;
  const menu = await prisma.menu.create({ data: { businessId, key: 'main', titleAr: 'القائمة', status: 'DRAFT' } });
  const category = await prisma.menuCategory.create({
    data: { menuId: menu.id, businessId, key: 'mains', nameAr: 'الأطباق', sortOrder: 0 },
  });
  await prisma.menuItem.create({
    data: { categoryId: category.id, businessId, itemCode: 'WF-001', nameAr: 'دجاج', priceMinor: 2500, currency: 'SAR', sortOrder: 0 },
  });
  await publishMenu(user, businessId, menu.id);

  const figure = await prisma.media.create({
    data: {
      businessId,
      kind: 'GALLERY',
      storageKey: `external/welcome-figure-${businessId}`,
      contentType: 'image/png',
      sizeBytes: 1,
      sourceUrl: FIGURE_URL,
      width: 512,
      height: 512,
    },
  });
  figureId = figure.id;

  const other = await makeBusiness(OTHER_SLUG);
  otherBusinessId = other.id;
  const otherFigure = await prisma.media.create({
    data: {
      businessId: otherBusinessId,
      kind: 'GALLERY',
      storageKey: `external/welcome-figure-${otherBusinessId}`,
      contentType: 'image/png',
      sizeBytes: 1,
      sourceUrl: 'https://cdn.example.test/other.png',
    },
  });
  otherFigureId = otherFigure.id;
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('the welcome figure', () => {
  it('is shown on the menu once the restaurant assigns it', async () => {
    await assignMedia(user, businessId, figureId, { type: 'business-welcome' });
    const profile = await getPublicProfile(publicId);
    expect(profile?.welcome?.url).toBe(FIGURE_URL);
  });

  it('is removed when the restaurant clears it', async () => {
    await assignMedia(user, businessId, null, { type: 'business-welcome' });
    const profile = await getPublicProfile(publicId);
    expect(profile?.welcome).toBeNull();
  });

  it('refuses another restaurant’s image', async () => {
    await expect(assignMedia(user, businessId, otherFigureId, { type: 'business-welcome' })).rejects.toThrow();
    const profile = await getPublicProfile(publicId);
    expect(profile?.welcome).toBeNull();
  });
});
