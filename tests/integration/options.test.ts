import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, publishMenu } from '@/server/admin/business-service';
import { saveOptionGroup, setModifierGroupItems } from '@/server/menu-studio/modifiers';
import { getPublicProfile } from '@/server/profile/repository';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import { resolveDatabase } from '../database';

/**
 * Options & add-ons: groups made on the options page reach the public menu.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'options-fixture';
const OTHER_SLUG = 'options-other';
const EMAIL = 'options-fixture@example.test';
const OTHER_EMAIL = 'options-other@example.test';

let businessId = '';
let publicId = '';
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
    currency: 'KWD',
    nameAr: 'مطعم',
    nameEn: slug,
  } as Parameters<typeof createBusiness>[1]);
}

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await removeFixture();

  const staff = await prisma.user.create({ data: { email: EMAIL, name: 'Options', role: 'SUPER_ADMIN' } });
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
  await prisma.menuItem.createMany({
    data: [
      { categoryId: mains.id, businessId, itemCode: 'SS-001', nameAr: 'بروستد', priceMinor: 2500, currency: 'KWD' },
      { categoryId: drinks.id, businessId, itemCode: 'SS-002', nameAr: 'برتقال', priceMinor: 900, currency: 'KWD' },
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

describe.skipIf(!databaseReachable)('options & add-ons', () => {
  it('saves a size group in the restaurant’s currency and puts it on the chosen dishes', async () => {
    const key = await saveOptionGroup(user, businessId, {
      nameAr: 'الحجم',
      nameEn: 'Size',
      required: true,
      max: 1,
      options: [
        { nameAr: 'وسط', price: '', isDefault: true },
        { nameAr: 'كبير', price: '1.250', isDefault: false },
        { nameAr: '', price: '9', isDefault: false },
      ],
      items: ['ss-001'],
    });

    const profile = await getPublicProfile(publicId);
    const dishes = profile?.menus[0]?.categories.flatMap((category) => category.items) ?? [];
    const broasted = dishes.find((item) => item.code === 'SS-001');
    expect(broasted?.modifiers).toEqual([
      {
        key,
        nameAr: 'الحجم',
        nameEn: 'Size',
        minSelect: 1,
        maxSelect: 1,
        options: [
          expect.objectContaining({ nameAr: 'وسط', priceDeltaMinor: 0, isDefault: true }),
          expect.objectContaining({ nameAr: 'كبير', priceDeltaMinor: 1250, isDefault: false }),
        ],
      },
    ]);
    expect(dishes.find((item) => item.code === 'SS-002')?.modifiers).toEqual([]);
  });

  it('editing keeps option keys, so carts holding them stay valid, and moves the group between dishes', async () => {
    const group = await prisma.modifierGroup.findFirstOrThrow({ where: { businessId }, include: { options: true } });
    const large = group.options.find((option) => option.nameAr === 'كبير')!;

    await saveOptionGroup(user, businessId, {
      key: group.key,
      nameAr: 'الحجم',
      required: true,
      max: 1,
      options: [{ key: large.key, nameAr: 'كبير', price: '1.5', isDefault: true }],
      items: ['SS-002'],
    });

    const options = await prisma.modifierOption.findMany({ where: { groupId: group.id } });
    expect(options.map((option) => [option.key, option.priceDeltaMinor])).toEqual([[large.key, 1500]]);
    const links = await prisma.menuItemModifierGroup.findMany({ where: { groupId: group.id }, include: { item: true } });
    expect(links.map((link) => link.item.itemCode)).toEqual(['SS-002']);
  });

  it('refuses a price that is not a number, more decimals than the currency has, and an empty name', async () => {
    const base = { nameAr: 'إضافات', required: false, max: 2, items: [] };
    await expect(
      saveOptionGroup(user, businessId, { ...base, options: [{ nameAr: 'جبنة', price: 'abc', isDefault: false }] }),
    ).rejects.toThrow(/جبنة/);
    await expect(
      saveOptionGroup(user, businessId, { ...base, options: [{ nameAr: 'جبنة', price: '0.1234', isDefault: false }] }),
    ).rejects.toThrow(/not a number/);
    await expect(
      saveOptionGroup(user, businessId, { ...base, nameAr: ' ', options: [{ nameAr: 'جبنة', price: '', isDefault: false }] }),
    ).rejects.toThrow(/name/);
  });

  it('never puts a group on another restaurant’s dish, and refuses another tenant', async () => {
    const group = await prisma.modifierGroup.findFirstOrThrow({ where: { businessId } });
    await prisma.menuItem.create({
      data: { categoryId: otherCategoryId, businessId: (await prisma.menuCategory.findUniqueOrThrow({ where: { id: otherCategoryId } })).businessId, itemCode: 'OT-009', nameAr: 'آخر', priceMinor: 100, currency: 'SAR' },
    });
    await expect(setModifierGroupItems(user, businessId, group.key, ['OT-009'])).rejects.toThrow(/OT-009/);
    await expect(
      saveOptionGroup(outsider, businessId, { nameAr: 'x', required: false, max: 1, options: [], items: [] }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});
