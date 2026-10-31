import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, publishMenu } from '@/server/admin/business-service';
import { duplicateOptionGroup, saveOptionGroup, setModifierGroupItems } from '@/server/menu-studio/modifiers';
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
        descriptionAr: null,
        descriptionEn: null,
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

  it('a drinks group: choose 2, the same drink twice allowed, calories per option, an unavailable one hidden', async () => {
    const key = await saveOptionGroup(user, businessId, {
      nameAr: 'اختر المشروب',
      descriptionAr: 'مشروبان مع الوجبة',
      required: true,
      min: 2,
      max: 2,
      options: [
        { nameAr: 'بيبسي', price: '', calories: '150', maxQty: 2, isDefault: false },
        { nameAr: 'ماء', price: '', calories: '0', maxQty: 2, isDefault: false },
        { nameAr: 'ميرندا', price: '0.250', calories: '', maxQty: 1, isDefault: false, isActive: false },
      ],
      items: ['SS-001'],
    });

    const stored = await prisma.modifierGroup.findFirstOrThrow({ where: { businessId, key }, include: { options: { orderBy: { sortOrder: 'asc' } } } });
    expect([stored.minSelect, stored.maxSelect, stored.descriptionAr]).toEqual([2, 2, 'مشروبان مع الوجبة']);
    expect(stored.options.map((option) => [option.nameAr, option.caloriesDelta, option.maxQty, option.isActive])).toEqual([
      ['بيبسي', 150, 2, true],
      ['ماء', 0, 2, true],
      // Empty calories stay unknown, never 0.
      ['ميرندا', null, 1, false],
    ]);

    const profile = await getPublicProfile(publicId);
    const dish = profile?.menus[0]?.categories.flatMap((category) => category.items).find((item) => item.code === 'SS-001');
    const drinks = dish?.modifiers.find((group) => group.key === key);
    expect(drinks?.options.map((option) => [option.nameAr, option.caloriesDelta, option.maxQty])).toEqual([
      ['بيبسي', 150, 2],
      ['ماء', 0, 2],
    ]);
  });

  it('refuses a per-option limit beyond the group, a minimum the options cannot fill, and fractional calories', async () => {
    const base = { nameAr: 'مشروبات', required: true, items: [] };
    await expect(
      saveOptionGroup(user, businessId, { ...base, min: 3, max: 3, options: [{ nameAr: 'ماء', price: '', maxQty: 2, isDefault: false }] }),
    ).rejects.toThrow(/minimum/);
    await expect(
      saveOptionGroup(user, businessId, { ...base, max: 2, options: [{ nameAr: 'ماء', price: '', calories: '1.5', isDefault: false }] }),
    ).rejects.toThrow(/whole number/);
  });

  it('duplicates a shared group as an independent copy on no dish; changing the copy leaves the original', async () => {
    const original = await prisma.modifierGroup.findFirstOrThrow({
      where: { businessId, nameAr: 'اختر المشروب' },
      include: { options: true, items: true },
    });
    const copyKey = await duplicateOptionGroup(user, businessId, original.key);
    const copy = await prisma.modifierGroup.findFirstOrThrow({ where: { businessId, key: copyKey }, include: { options: true, items: true } });
    expect(copy.items).toEqual([]);
    expect(copy.options.map((option) => [option.nameAr, option.caloriesDelta, option.maxQty]).sort()).toEqual(
      original.options.map((option) => [option.nameAr, option.caloriesDelta, option.maxQty]).sort(),
    );

    await saveOptionGroup(user, businessId, {
      key: copyKey,
      nameAr: 'مشروب واحد',
      required: true,
      max: 1,
      options: [{ nameAr: 'ماء', price: '', isDefault: false }],
      items: [],
    });
    const after = await prisma.modifierGroup.findUniqueOrThrow({ where: { id: original.id }, include: { options: true, items: true } });
    expect([after.nameAr, after.maxSelect, after.options.length, after.items.length]).toEqual([
      'اختر المشروب',
      2,
      3,
      original.items.length,
    ]);

    // Another restaurant cannot copy it.
    await expect(duplicateOptionGroup(outsider, businessId, original.key)).rejects.toBeInstanceOf(TenantAccessError);
  });
});
