import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, publishMenu, setItemUpsell } from '@/server/admin/business-service';
import { getPublicProfile } from '@/server/profile/repository';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import { resolveDatabase } from '../database';

/**
 * Upsell: the dishes a restaurant suggests with each dish, and "new" dishes.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'upsell-fixture';
const OTHER_SLUG = 'upsell-other';
const EMAIL = 'upsell-fixture@example.test';
const OTHER_EMAIL = 'upsell-other@example.test';

let businessId = '';
let publicId = '';
let otherBusinessId = '';
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

  const staff = await prisma.user.create({ data: { email: EMAIL, name: 'Upsell', role: 'SUPER_ADMIN' } });
  user = { id: staff.id, role: 'SUPER_ADMIN' };
  const other = await prisma.user.create({ data: { email: OTHER_EMAIL, name: 'Other', role: 'STAFF' } });
  outsider = { id: other.id, role: 'STAFF' };

  const business = await makeBusiness(SLUG);
  businessId = business.id;
  publicId = business.publicId;
  const menu = await prisma.menu.create({ data: { businessId, key: 'main', titleAr: 'القائمة', status: 'DRAFT' } });
  const category = await prisma.menuCategory.create({
    data: { menuId: menu.id, businessId, key: 'mains', nameAr: 'الأطباق', sortOrder: 0 },
  });
  await prisma.menuItem.createMany({
    data: [
      { categoryId: category.id, businessId, itemCode: 'UP-001', nameAr: 'بروستد', priceMinor: 2500, currency: 'SAR', sortOrder: 0 },
      { categoryId: category.id, businessId, itemCode: 'UP-002', nameAr: 'بيبسي', priceMinor: 300, currency: 'SAR', sortOrder: 1 },
      { categoryId: category.id, businessId, itemCode: 'UP-003', nameAr: 'سلطة', priceMinor: 900, currency: 'SAR', sortOrder: 2 },
      { categoryId: category.id, businessId, itemCode: 'UP-004', nameAr: 'بطاطا', priceMinor: 700, currency: 'SAR', sortOrder: 3 },
      { categoryId: category.id, businessId, itemCode: 'UP-005', nameAr: 'كولا', priceMinor: 300, currency: 'SAR', sortOrder: 4 },
    ],
  });
  await publishMenu(user, businessId, menu.id);

  const otherBusiness = await makeBusiness(OTHER_SLUG);
  otherBusinessId = otherBusiness.id;
  const otherMenu = await prisma.menu.create({
    data: { businessId: otherBusinessId, key: 'main', titleAr: 'قائمة', status: 'DRAFT' },
  });
  const otherCategory = await prisma.menuCategory.create({
    data: { menuId: otherMenu.id, businessId: otherBusinessId, key: 'x', nameAr: 'س', sortOrder: 0 },
  });
  await prisma.menuItem.create({
    data: { categoryId: otherCategory.id, businessId: otherBusinessId, itemCode: 'OT-001', nameAr: 'آخر', priceMinor: 100, currency: 'SAR' },
  });
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('upsell', () => {
  it('stores suggestions and the new mark, and the public menu carries them', async () => {
    await setItemUpsell(user, businessId, { itemCode: 'up-001', pairsWith: ['UP-002', 'up-003'], isNew: true });

    const profile = await getPublicProfile(publicId);
    const broasted = profile?.menus[0]?.categories[0]?.items.find((item) => item.code === 'UP-001');
    expect(broasted?.pairsWith).toEqual(['UP-002', 'UP-003']);
    expect(broasted?.tags).toContain('new');
  });

  it('clears the new mark without touching other tags', async () => {
    await prisma.menuItem.update({
      where: { businessId_itemCode: { businessId, itemCode: 'UP-001' } },
      data: { tags: { push: 'spicy' } },
    });
    await setItemUpsell(user, businessId, { itemCode: 'UP-001', pairsWith: [], isNew: false });

    const row = await prisma.menuItem.findUniqueOrThrow({
      where: { businessId_itemCode: { businessId, itemCode: 'UP-001' } },
    });
    expect(row.tags).toEqual(['spicy']);
    expect(row.pairsWith).toEqual([]);
  });

  it('refuses more than three, duplicates, the dish itself and unknown codes', async () => {
    const set = (pairsWith: string[]) => setItemUpsell(user, businessId, { itemCode: 'UP-001', pairsWith, isNew: false });

    await expect(set(['UP-002', 'UP-003', 'UP-004', 'UP-005'])).rejects.toThrow(/at most 3/);
    await expect(set(['UP-002', 'UP-002'])).rejects.toThrow(/twice/);
    await expect(set(['UP-001'])).rejects.toThrow(/itself/);
    await expect(set(['NOPE-1'])).rejects.toThrow(/NOPE-1/);
  });

  it('never suggests another restaurant’s dish, and refuses another tenant', async () => {
    await expect(
      setItemUpsell(user, businessId, { itemCode: 'UP-001', pairsWith: ['OT-001'], isNew: false }),
    ).rejects.toThrow(/OT-001/);

    await expect(
      setItemUpsell(outsider, businessId, { itemCode: 'UP-001', pairsWith: [], isNew: false }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});
