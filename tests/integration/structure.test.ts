import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, publishMenu } from '@/server/admin/business-service';
import {
  duplicateCategory,
  duplicateItem,
  duplicateMenu,
  move,
  reorder,
} from '@/server/admin/structure-service';
import { getPublicProfile } from '@/server/profile/repository';
import { resetEnvCache } from '@/lib/env';
import { resolveDatabase } from '../database';

/**
 * Duplication and ordering, against a real database.
 *
 * The properties worth asserting are the ones that make a copy *safe* — that
 * it does not publish itself, does not inherit a publication history it never
 * had, and does not collide with the rows it was copied from — and the one
 * that makes reordering safe: that it cannot touch another tenant's rows.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'structure-fixture';
const OTHER_SLUG = 'structure-other';
const EMAIL = 'structure-fixture@example.test';

let businessId = '';
let publicId = '';
let menuId = '';
let categoryId = '';
let orderingCategoryId = '';
let otherBusinessId = '';
let otherCategoryId = '';
let user = { id: '', role: 'SUPER_ADMIN' as const };

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function makeBusiness(slug: string, nameEn: string) {
  return createBusiness(user, {
    slug,
    type: 'RESTAURANT',
    status: 'ACTIVE',
    defaultLocale: 'ar',
    currency: 'SAR',
    nameAr: 'مطعم',
    nameEn,
  } as Parameters<typeof createBusiness>[1]);
}

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;

  await removeFixture();

  const staff = await prisma.user.create({
    data: { email: EMAIL, name: 'Structure Fixture', role: 'SUPER_ADMIN' },
  });
  user = { id: staff.id, role: 'SUPER_ADMIN' };

  const business = await makeBusiness(SLUG, 'Structure Fixture');
  businessId = business.id;
  publicId = business.publicId;

  const menu = await prisma.menu.create({
    data: { businessId, key: 'main', titleAr: 'القائمة', titleEn: 'Main Menu', status: 'DRAFT' },
  });
  menuId = menu.id;

  const category = await prisma.menuCategory.create({
    data: { menuId, businessId, key: 'mains', nameAr: 'الأطباق', nameEn: 'Mains', sortOrder: 0 },
  });
  categoryId = category.id;

  await prisma.menuItem.createMany({
    data: [
      { categoryId: category.id, businessId, itemCode: 'SF-001', nameAr: 'برجر', nameEn: 'Burger', priceMinor: 3800, currency: 'SAR', sortOrder: 0 },
      { categoryId: category.id, businessId, itemCode: 'SF-002', nameAr: 'سلطة', nameEn: 'Salad', priceMinor: 2200, currency: 'SAR', sortOrder: 1 },
      { categoryId: category.id, businessId, itemCode: 'SF-003', nameAr: 'حساء', nameEn: 'Soup', priceMinor: 1800, currency: 'SAR', sortOrder: 2 },
    ],
  });

  /*
   * Ordering gets a category of its own. Sharing one with the duplication
   * tests made the assertions depend on test order: a copied item lands in the
   * same section and quietly becomes a fourth sibling.
   */
  const ordering = await prisma.menuCategory.create({
    data: { menuId, businessId, key: 'ordering', nameAr: 'الترتيب', nameEn: 'Ordering', sortOrder: 1 },
  });
  orderingCategoryId = ordering.id;

  await prisma.menuItem.createMany({
    data: [
      { categoryId: ordering.id, businessId, itemCode: 'SO-001', nameAr: 'أ', priceMinor: 100, currency: 'SAR', sortOrder: 0 },
      { categoryId: ordering.id, businessId, itemCode: 'SO-002', nameAr: 'ب', priceMinor: 200, currency: 'SAR', sortOrder: 1 },
      { categoryId: ordering.id, businessId, itemCode: 'SO-003', nameAr: 'ج', priceMinor: 300, currency: 'SAR', sortOrder: 2 },
    ],
  });

  await publishMenu(user, businessId, menuId);

  const other = await makeBusiness(OTHER_SLUG, 'Structure Other');
  otherBusinessId = other.id;

  const otherMenu = await prisma.menu.create({
    data: { businessId: otherBusinessId, key: 'main', titleAr: 'قائمة', status: 'DRAFT' },
  });
  const otherCategory = await prisma.menuCategory.create({
    data: { menuId: otherMenu.id, businessId: otherBusinessId, key: 'x', nameAr: 'س', sortOrder: 0 },
  });
  otherCategoryId = otherCategory.id;
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('duplicateMenu', () => {
  it('copies the structure without copying the publication', async () => {
    const copy = await duplicateMenu(user, businessId, menuId);

    // A copy is work in progress: never live, never carrying a history it
    // did not earn.
    expect(copy.status).toBe('DRAFT');
    expect(copy.currentVersionId).toBeNull();
    expect(await prisma.menuVersion.count({ where: { menuId: copy.id } })).toBe(0);

    // The key is derived and readable, because it lands in the public URL.
    expect(copy.key).toBe('main-copy');

    const categories = await prisma.menuCategory.findMany({
      where: { menuId: copy.id },
      include: { items: true },
    });

    // Both sections of the source menu, with all six of their items.
    expect(categories).toHaveLength(2);
    expect(categories.flatMap((category) => category.items)).toHaveLength(6);
  });

  it('rewrites item codes, which are unique per business', async () => {
    const copy = await duplicateMenu(user, businessId, menuId);

    const codes = (
      await prisma.menuItem.findMany({
        where: { businessId, category: { menuId: copy.id } },
        select: { itemCode: true },
      })
    ).map((row) => row.itemCode);

    expect(codes).toHaveLength(6);
    for (const code of codes) expect(code).not.toBe('SF-001');
    // Every rewritten code is distinct, or the copy would have collided with
    // itself rather than only with its source.
    expect(new Set(codes).size).toBe(codes.length);

    // And the originals are untouched.
    expect(
      await prisma.menuItem.findFirst({ where: { businessId, itemCode: 'SF-001' } }),
    ).not.toBeNull();
  });

  it('does not put the copy in front of a visitor', async () => {
    const profile = await getPublicProfile(publicId);
    expect(profile?.menus.map((menu) => menu.key)).toEqual(['main']);
  });

  it('refuses a menu belonging to another business', async () => {
    await expect(duplicateMenu(user, otherBusinessId, menuId)).rejects.toThrow(/not found/i);
  });
});

describe.skipIf(!databaseReachable)('duplicateCategory and duplicateItem', () => {
  it('copies a section with its items', async () => {
    const copy = await duplicateCategory(user, businessId, categoryId);

    expect(copy.key).toMatch(/^mains-copy/);
    expect(await prisma.menuItem.count({ where: { categoryId: copy.id } })).toBe(3);
  });

  it('copies an item hidden, so a placeholder is never offered to a customer', async () => {
    const source = await prisma.menuItem.findFirstOrThrow({
      where: { businessId, itemCode: 'SF-001' },
    });

    const copy = await duplicateItem(user, businessId, source.id);

    expect(copy.availability).toBe('HIDDEN');
    expect(copy.itemCode).not.toBe('SF-001');
    expect(copy.priceMinor).toBe(source.priceMinor);
  });
});

describe.skipIf(!databaseReachable)('ordering', () => {
  async function codesInOrder() {
    const rows = await prisma.menuItem.findMany({
      where: { categoryId: orderingCategoryId },
      orderBy: [{ sortOrder: 'asc' }, { itemCode: 'asc' }],
      select: { itemCode: true },
    });
    return rows.map((row) => row.itemCode);
  }

  it('writes the order it is given', async () => {
    const items = await prisma.menuItem.findMany({
      where: { categoryId: orderingCategoryId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, itemCode: true },
    });

    const reversed = [...items].reverse().map((item) => item.id);
    await reorder(user, businessId, 'item', orderingCategoryId, reversed);

    expect(await codesInOrder()).toEqual(['SO-003', 'SO-002', 'SO-001']);
  });

  it('is idempotent — replaying the same order does not drift it', async () => {
    const items = await prisma.menuItem.findMany({
      where: { categoryId: orderingCategoryId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });
    const order = items.map((item) => item.id);

    await reorder(user, businessId, 'item', orderingCategoryId, order);
    await reorder(user, businessId, 'item', orderingCategoryId, order);

    expect(await codesInOrder()).toEqual(['SO-003', 'SO-002', 'SO-001']);
  });

  it('moves one row one place, and stops at the end rather than erroring', async () => {
    const first = await prisma.menuItem.findFirstOrThrow({
      where: { categoryId: orderingCategoryId },
      orderBy: { sortOrder: 'asc' },
    });

    expect(await move(user, businessId, 'item', first.id, 'up')).toEqual({ moved: 0 });

    await move(user, businessId, 'item', first.id, 'down');
    const after = await codesInOrder();
    expect(after[0]).not.toBe(first.itemCode);
  });

  it('refuses a row that is not in the named parent', async () => {
    const foreign = await prisma.menuItem.findFirstOrThrow({ where: { businessId } });

    await expect(
      reorder(user, businessId, 'item', otherCategoryId, [foreign.id]),
    ).rejects.toThrow(/unknown item/i);
  });

  it('refuses duplicate ids rather than silently collapsing them', async () => {
    const item = await prisma.menuItem.findFirstOrThrow({ where: { categoryId: orderingCategoryId } });

    await expect(
      reorder(user, businessId, 'item', orderingCategoryId, [item.id, item.id]),
    ).rejects.toThrow(/twice/i);
  });
});
