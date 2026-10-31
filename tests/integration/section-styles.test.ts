import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, publishMenu, setCategoryStyles } from '@/server/admin/business-service';
import { getPublicProfile } from '@/server/profile/repository';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import { resolveDatabase } from '../database';

/**
 * Section layouts: each category of the menu keeps its own display style.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'section-style-fixture';
const OTHER_SLUG = 'section-style-other';
const EMAIL = 'section-style-fixture@example.test';
const OTHER_EMAIL = 'section-style-other@example.test';

let businessId = '';
let publicId = '';
let mainsId = '';
let drinksId = '';
let otherCategoryId = '';
let user = { id: '', role: 'SUPER_ADMIN' as const };
let outsider = { id: '', role: 'STAFF' as const };

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
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

  const staff = await prisma.user.create({ data: { email: EMAIL, name: 'Sections', role: 'SUPER_ADMIN' } });
  user = { id: staff.id, role: 'SUPER_ADMIN' };
  const other = await prisma.user.create({ data: { email: OTHER_EMAIL, name: 'Other', role: 'STAFF' } });
  outsider = { id: other.id, role: 'STAFF' };

  const business = await makeBusiness(SLUG);
  businessId = business.id;
  publicId = business.publicId;
  const menu = await prisma.menu.create({ data: { businessId, key: 'main', titleAr: 'القائمة', status: 'DRAFT' } });
  const mains = await prisma.menuCategory.create({
    data: { menuId: menu.id, businessId, key: 'mains', nameAr: 'الأطباق', sortOrder: 0 },
  });
  const drinks = await prisma.menuCategory.create({
    data: { menuId: menu.id, businessId, key: 'drinks', nameAr: 'العصائر', sortOrder: 1 },
  });
  mainsId = mains.id;
  drinksId = drinks.id;
  await prisma.menuItem.createMany({
    data: [
      { categoryId: mains.id, businessId, itemCode: 'SS-001', nameAr: 'بروستد', priceMinor: 2500, currency: 'SAR' },
      { categoryId: drinks.id, businessId, itemCode: 'SS-002', nameAr: 'برتقال', priceMinor: 900, currency: 'SAR' },
    ],
  });
  await publishMenu(user, businessId, menu.id);

  const otherBusiness = await makeBusiness(OTHER_SLUG);
  const otherMenu = await prisma.menu.create({
    data: { businessId: otherBusiness.id, key: 'main', titleAr: 'قائمة', status: 'DRAFT' },
  });
  const otherCategory = await prisma.menuCategory.create({
    data: { menuId: otherMenu.id, businessId: otherBusiness.id, key: 'x', nameAr: 'س', sortOrder: 0 },
  });
  otherCategoryId = otherCategory.id;
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('section styles', () => {
  it('starts every section on auto, and the public menu carries each section’s own style', async () => {
    const before = await getPublicProfile(publicId);
    expect(before?.menus[0]?.categories.map((category) => category.displayStyle)).toEqual(['auto', 'auto']);

    const changed = await setCategoryStyles(user, businessId, [
      { categoryId: mainsId, style: 'featured' },
      { categoryId: drinksId, style: 'carousel' },
    ]);
    expect(changed).toBe(2);

    const after = await getPublicProfile(publicId);
    expect(after?.menus[0]?.categories.map((category) => [category.key, category.displayStyle])).toEqual([
      ['mains', 'featured'],
      ['drinks', 'carousel'],
    ]);
  });

  it('saves only what changed and records it', async () => {
    const changed = await setCategoryStyles(user, businessId, [
      { categoryId: mainsId, style: 'featured' },
      { categoryId: drinksId, style: 'list' },
    ]);
    expect(changed).toBe(1);

    const audit = await prisma.auditLog.findFirst({
      where: { businessId, action: 'category.display_style_updated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.metadata).toMatchObject({ changes: [{ categoryId: drinksId, before: 'carousel', after: 'list' }] });
  });

  it('refuses an unknown style', async () => {
    await expect(
      setCategoryStyles(user, businessId, [{ categoryId: mainsId, style: 'zigzag' }]),
    ).rejects.toThrow(/zigzag/);
  });

  it('never touches another restaurant’s section, and refuses another tenant', async () => {
    await expect(
      setCategoryStyles(user, businessId, [{ categoryId: otherCategoryId, style: 'list' }]),
    ).rejects.toThrow(/does not belong/);
    const untouched = await prisma.menuCategory.findUniqueOrThrow({ where: { id: otherCategoryId } });
    expect(untouched.displayStyle).toBe('auto');

    await expect(
      setCategoryStyles(outsider, businessId, [{ categoryId: mainsId, style: 'grid' }]),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});
