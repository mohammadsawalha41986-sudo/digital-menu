import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, publishMenu, ValidationError } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import {
  createDish,
  deleteDishes,
  deleteMenu,
  ItemConflictError,
  listDeletedRecords,
  menuImpact,
  moveDishes,
  reorderDishes,
  restoreDeletedRecord,
  updateDish,
} from '@/server/menu-manage/service';
import { resolveDatabase } from '../database';

/**
 * Menu and dish management, against the real database. Each test that removes
 * something checks that it can be brought back, and that nothing outside its
 * own restaurant was touched.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'menu-manage-fixture';
const OTHER_SLUG = 'menu-manage-other';
const EMAIL = 'menu-manage@example.test';
const EDITOR_EMAIL = 'menu-manage-editor@example.test';

let owner = { id: '', role: 'SUPER_ADMIN' as const };
let editor = { id: '', role: 'STAFF' as const };
let businessId = '';
let otherBusinessId = '';

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, EDITOR_EMAIL] } } });
}

async function makeBusiness(slug: string) {
  return createBusiness(owner, {
    slug,
    type: 'RESTAURANT',
    status: 'ACTIVE',
    defaultLocale: 'ar',
    currency: 'SAR',
    nameAr: 'مطعم',
    nameEn: slug,
  } as Parameters<typeof createBusiness>[1]);
}

/** A menu with two sections and three dishes, published once so it has a version. */
async function seedMenu(bizId: string, key: string) {
  const menu = await prisma.menu.create({
    data: { businessId: bizId, key, titleAr: `قائمة ${key}`, titleEn: key, status: 'DRAFT' },
  });
  const mains = await prisma.menuCategory.create({
    data: { menuId: menu.id, businessId: bizId, key: `${key}-mains`, nameAr: 'الأطباق', nameEn: 'Mains', sortOrder: 0 },
  });
  const drinks = await prisma.menuCategory.create({
    data: { menuId: menu.id, businessId: bizId, key: `${key}-drinks`, nameAr: 'مشروبات', nameEn: 'Drinks', sortOrder: 1 },
  });
  const codes = [`${key}-A`, `${key}-B`, `${key}-C`] as const;
  await prisma.menuItem.createMany({
    data: [
      { categoryId: mains.id, businessId: bizId, itemCode: codes[0], nameAr: 'أ', nameEn: 'Alpha', priceMinor: 2500, currency: 'SAR', sortOrder: 0 },
      { categoryId: mains.id, businessId: bizId, itemCode: codes[1], nameAr: 'ب', nameEn: 'Bravo', priceMinor: 3000, currency: 'SAR', sortOrder: 1 },
      { categoryId: drinks.id, businessId: bizId, itemCode: codes[2], nameAr: 'ج', nameEn: 'Charlie', priceMinor: 500, currency: 'SAR', sortOrder: 0 },
    ],
  });
  await publishMenu(owner, bizId, menu.id);
  return { menuId: menu.id, mainsId: mains.id, drinksId: drinks.id, codes: codes as unknown as [string, string, string] };
}

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await removeFixture();

  const ownerRow = await prisma.user.create({ data: { email: EMAIL, name: 'Menu owner', role: 'SUPER_ADMIN' } });
  owner = { id: ownerRow.id, role: 'SUPER_ADMIN' };
  const editorRow = await prisma.user.create({ data: { email: EDITOR_EMAIL, name: 'Menu editor', role: 'STAFF' } });
  editor = { id: editorRow.id, role: 'STAFF' };

  const business = await makeBusiness(SLUG);
  businessId = business.id;
  const other = await makeBusiness(OTHER_SLUG);
  otherBusinessId = other.id;

  await prisma.businessMembership.create({ data: { userId: editorRow.id, businessId, role: 'EDITOR' } });
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

const run = databaseReachable ? describe : describe.skip;

run('deleting a menu', () => {
  beforeEach(async () => {
    await prisma.deletedRecord.deleteMany({ where: { businessId } });
    await prisma.menu.deleteMany({ where: { businessId, key: { startsWith: 'del-' } } });
  });

  it('refuses until the owner types the menu name exactly', async () => {
    const seeded = await seedMenu(businessId, 'del-typed');
    await expect(deleteMenu(owner, businessId, seeded.menuId, 'del-typ')).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.menu.findUnique({ where: { id: seeded.menuId } })).not.toBeNull();
  });

  it('removes the menu, keeps a full record, and restores it with the same ids', async () => {
    const seeded = await seedMenu(businessId, 'del-restore');
    const before = await prisma.menuItem.findMany({ where: { businessId, itemCode: { in: seeded.codes } }, orderBy: { itemCode: 'asc' } });
    const versionsBefore = await prisma.menuVersion.count({ where: { menuId: seeded.menuId } });
    expect(versionsBefore).toBeGreaterThan(0);

    const { recordId, impact } = await deleteMenu(owner, businessId, seeded.menuId, 'del-restore');
    expect(impact.dishes).toBe(3);
    expect(impact.isLive).toBe(true);
    expect(await prisma.menu.findUnique({ where: { id: seeded.menuId } })).toBeNull();
    expect(await prisma.menuItem.count({ where: { businessId, itemCode: { in: seeded.codes } } })).toBe(0);

    const records = await listDeletedRecords(owner, businessId);
    expect(records.find((record) => record.id === recordId)).toMatchObject({ kind: 'MENU', count: 3, restoredAt: null });

    await restoreDeletedRecord(owner, businessId, recordId);
    expect(await prisma.menu.findUnique({ where: { id: seeded.menuId } })).not.toBeNull();
    const after = await prisma.menuItem.findMany({ where: { businessId, itemCode: { in: seeded.codes } }, orderBy: { itemCode: 'asc' } });
    expect(after.map((item) => item.id)).toEqual(before.map((item) => item.id));
    expect(after.map((item) => item.priceMinor)).toEqual(before.map((item) => item.priceMinor));
    expect(await prisma.menuVersion.count({ where: { menuId: seeded.menuId } })).toBe(versionsBefore);
  });

  it('will not restore the same deletion twice', async () => {
    const seeded = await seedMenu(businessId, 'del-twice');
    const { recordId } = await deleteMenu(owner, businessId, seeded.menuId, 'del-twice');
    await restoreDeletedRecord(owner, businessId, recordId);
    await expect(restoreDeletedRecord(owner, businessId, recordId)).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses when a dish outside the menu suggests one of its dishes', async () => {
    const kept = await seedMenu(businessId, 'del-kept');
    const doomed = await seedMenu(businessId, 'del-doomed');
    await prisma.menuItem.update({ where: { businessId_itemCode: { businessId, itemCode: kept.codes[0] } }, data: { pairsWith: [doomed.codes[2]] } });

    const impact = await menuImpact(owner, businessId, doomed.menuId);
    expect(impact.blockedBy).toContain('Alpha');
    await expect(deleteMenu(owner, businessId, doomed.menuId, 'del-doomed')).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.menu.findUnique({ where: { id: doomed.menuId } })).not.toBeNull();
  });

  it('will not restore over a menu that now has the same name', async () => {
    const seeded = await seedMenu(businessId, 'del-clash');
    const { recordId } = await deleteMenu(owner, businessId, seeded.menuId, 'del-clash');
    await seedMenu(businessId, 'del-clash-other').then(() => undefined);
    await prisma.menu.create({ data: { businessId, key: 'del-clash', titleAr: 'جديدة', status: 'DRAFT' } });
    await expect(restoreDeletedRecord(owner, businessId, recordId)).rejects.toBeInstanceOf(ValidationError);
  });

  it('a manager is needed: an editor cannot delete a menu', async () => {
    const seeded = await seedMenu(businessId, 'del-role');
    await expect(deleteMenu(editor, businessId, seeded.menuId, 'del-role')).rejects.toBeInstanceOf(TenantAccessError);
    expect(await prisma.menu.findUnique({ where: { id: seeded.menuId } })).not.toBeNull();
  });

  it('cannot touch a menu of another restaurant', async () => {
    const theirs = await seedMenu(otherBusinessId, 'del-theirs');
    await expect(deleteMenu(owner, businessId, theirs.menuId, 'del-theirs')).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.menu.findUnique({ where: { id: theirs.menuId } })).not.toBeNull();
  });
});

run('deleting dishes in bulk', () => {
  it('removes several dishes at once and restores them with their codes', async () => {
    const seeded = await seedMenu(businessId, 'bulk-a');
    const rows = await prisma.menuItem.findMany({ where: { businessId, itemCode: { in: seeded.codes.slice(0, 2) } }, select: { id: true } });
    const { recordId, count } = await deleteDishes(owner, businessId, rows.map((row) => row.id));
    expect(count).toBe(2);
    expect(await prisma.menuItem.count({ where: { businessId, itemCode: { in: seeded.codes.slice(0, 2) } } })).toBe(0);

    await restoreDeletedRecord(owner, businessId, recordId);
    expect(await prisma.menuItem.count({ where: { businessId, itemCode: { in: seeded.codes.slice(0, 2) } } })).toBe(2);
  });

  it('refuses a dish that another dish still suggests', async () => {
    const seeded = await seedMenu(businessId, 'bulk-b');
    await prisma.menuItem.update({ where: { businessId_itemCode: { businessId, itemCode: seeded.codes[2] } }, data: { pairsWith: [seeded.codes[0]] } });
    const target = await prisma.menuItem.findFirstOrThrow({ where: { businessId, itemCode: seeded.codes[0] }, select: { id: true } });
    await expect(deleteDishes(owner, businessId, [target.id])).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.menuItem.findUnique({ where: { id: target.id } })).not.toBeNull();
  });

  it('will not delete a dish of another restaurant, even with its id', async () => {
    const theirs = await seedMenu(otherBusinessId, 'bulk-theirs');
    const row = await prisma.menuItem.findFirstOrThrow({ where: { businessId: otherBusinessId, itemCode: theirs.codes[0] }, select: { id: true } });
    await expect(deleteDishes(owner, businessId, [row.id])).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.menuItem.findUnique({ where: { id: row.id } })).not.toBeNull();
  });

  it('an editor cannot bulk-delete', async () => {
    const seeded = await seedMenu(businessId, 'bulk-role');
    const row = await prisma.menuItem.findFirstOrThrow({ where: { businessId, itemCode: seeded.codes[0] }, select: { id: true } });
    await expect(deleteDishes(editor, businessId, [row.id])).rejects.toBeInstanceOf(TenantAccessError);
  });

  it('will not restore dishes whose section was deleted in the meantime', async () => {
    const seeded = await seedMenu(businessId, 'bulk-section');
    const row = await prisma.menuItem.findFirstOrThrow({ where: { businessId, itemCode: seeded.codes[2] }, select: { id: true } });
    const { recordId } = await deleteDishes(owner, businessId, [row.id]);
    await prisma.menuCategory.delete({ where: { id: seeded.drinksId } });
    await expect(restoreDeletedRecord(owner, businessId, recordId)).rejects.toBeInstanceOf(ValidationError);
  });
});

run('editing a dish', () => {
  it('saves the fields it is given, and a price change leaves a price history row', async () => {
    const seeded = await seedMenu(businessId, 'edit-a');
    const row = await prisma.menuItem.findFirstOrThrow({ where: { businessId, itemCode: seeded.codes[0] }, select: { id: true, updatedAt: true } });

    const saved = await updateDish(owner, businessId, row.id, { nameEn: 'Alpha Two', price: '30' }, row.updatedAt.toISOString());
    expect(saved.nameEn).toBe('Alpha Two');
    expect(saved.priceMinor).toBe(3000);
    const history = await prisma.priceHistory.findMany({ where: { businessId, itemCode: seeded.codes[0] } });
    expect(history.map((entry) => [entry.oldPriceMinor, entry.newPriceMinor])).toEqual([[2500, 3000]]);
  });

  it('does not write a price history row when the price stays the same', async () => {
    const seeded = await seedMenu(businessId, 'edit-same');
    const row = await prisma.menuItem.findFirstOrThrow({ where: { businessId, itemCode: seeded.codes[1] }, select: { id: true } });
    await updateDish(owner, businessId, row.id, { price: '30' }, null);
    expect(await prisma.priceHistory.count({ where: { businessId, itemCode: seeded.codes[1] } })).toBe(0);
  });

  it('refuses a price it cannot read, and an empty name, and writes nothing', async () => {
    const seeded = await seedMenu(businessId, 'edit-bad');
    const row = await prisma.menuItem.findFirstOrThrow({ where: { businessId, itemCode: seeded.codes[0] }, select: { id: true, priceMinor: true } });
    await expect(updateDish(owner, businessId, row.id, { price: 'abc' }, null)).rejects.toBeInstanceOf(ValidationError);
    await expect(updateDish(owner, businessId, row.id, { nameAr: '   ' }, null)).rejects.toBeInstanceOf(ValidationError);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: row.id } })).priceMinor).toBe(row.priceMinor);
  });

  it('a stale screen is refused and shown what is there now, without overwriting it', async () => {
    const seeded = await seedMenu(businessId, 'edit-stale');
    const row = await prisma.menuItem.findFirstOrThrow({ where: { businessId, itemCode: seeded.codes[0] }, select: { id: true, updatedAt: true } });
    const stale = new Date(row.updatedAt.getTime() - 60_000).toISOString();

    await expect(updateDish(owner, businessId, row.id, { nameEn: 'Mine' }, stale)).rejects.toBeInstanceOf(ItemConflictError);
    const current = await prisma.menuItem.findUniqueOrThrow({ where: { id: row.id } });
    expect(current.nameEn).toBe('Alpha');
  });

  it('accepts seasonal, but not an unknown availability', async () => {
    const seeded = await seedMenu(businessId, 'edit-state');
    const row = await prisma.menuItem.findFirstOrThrow({ where: { businessId, itemCode: seeded.codes[0] }, select: { id: true } });
    await updateDish(owner, businessId, row.id, { availability: 'SEASONAL' }, null);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: row.id } })).availability).toBe('SEASONAL');
    await expect(updateDish(owner, businessId, row.id, { availability: 'GONE' as never }, null)).rejects.toBeInstanceOf(ValidationError);
  });

  it('cannot edit a dish of another restaurant', async () => {
    const theirs = await seedMenu(otherBusinessId, 'edit-theirs');
    const row = await prisma.menuItem.findFirstOrThrow({ where: { businessId: otherBusinessId, itemCode: theirs.codes[0] }, select: { id: true } });
    await expect(updateDish(owner, businessId, row.id, { nameEn: 'Hacked' }, null)).rejects.toBeInstanceOf(ValidationError);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: row.id } })).nameEn).toBe('Alpha');
  });
});

run('order, move and add', () => {
  it('sets the order of a section, and refuses an order that does not match it', async () => {
    const seeded = await seedMenu(businessId, 'order-a');
    const rows = await prisma.menuItem.findMany({ where: { businessId, categoryId: seeded.mainsId }, select: { id: true } });
    await reorderDishes(owner, businessId, seeded.mainsId, [...rows].reverse().map((row) => row.id));
    const ordered = await prisma.menuItem.findMany({ where: { businessId, categoryId: seeded.mainsId }, orderBy: { sortOrder: 'asc' } });
    expect(ordered.map((row) => row.itemCode)).toEqual([seeded.codes[1], seeded.codes[0]]);

    await expect(reorderDishes(owner, businessId, seeded.mainsId, [rows[0]!.id])).rejects.toBeInstanceOf(ValidationError);
  });

  it('moves dishes to another section and keeps their codes', async () => {
    const seeded = await seedMenu(businessId, 'move-a');
    const row = await prisma.menuItem.findFirstOrThrow({ where: { businessId, itemCode: seeded.codes[0] }, select: { id: true } });
    expect(await moveDishes(owner, businessId, [row.id], seeded.drinksId)).toBe(1);
    const moved = await prisma.menuItem.findUniqueOrThrow({ where: { id: row.id } });
    expect(moved.categoryId).toBe(seeded.drinksId);
    expect(moved.itemCode).toBe(seeded.codes[0]);
  });

  it('will not move a dish into a section of another restaurant', async () => {
    const seeded = await seedMenu(businessId, 'move-b');
    const theirs = await seedMenu(otherBusinessId, 'move-theirs');
    const row = await prisma.menuItem.findFirstOrThrow({ where: { businessId, itemCode: seeded.codes[0] }, select: { id: true } });
    await expect(moveDishes(owner, businessId, [row.id], theirs.drinksId)).rejects.toBeInstanceOf(ValidationError);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: row.id } })).categoryId).toBe(seeded.mainsId);
  });

  it('adds a dish with a free code, and refuses an unreadable price', async () => {
    const seeded = await seedMenu(businessId, 'add-a');
    const added = await createDish(owner, businessId, { categoryId: seeded.drinksId, nameAr: 'جديد', nameEn: 'New', price: '12.5' });
    expect(added.priceMinor).toBe(1250);
    expect(added.itemCode).toBeTruthy();
    await expect(createDish(owner, businessId, { categoryId: seeded.drinksId, nameAr: 'س', price: 'x' })).rejects.toBeInstanceOf(ValidationError);
  });
});
