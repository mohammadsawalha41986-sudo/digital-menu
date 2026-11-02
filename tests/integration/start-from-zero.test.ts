import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, ValidationError } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import { createDish, createSection, deleteMenu, deleteSection, restoreDeletedRecord } from '@/server/menu-manage/service';
import { parseSpreadsheet } from '@/server/import/parse';
import { validateRows } from '@/server/import/validate';
import { executeImport } from '@/server/import/execute';
import { getPublicProfile } from '@/server/profile/repository';
import { resolveDatabase } from '../database';

/**
 * A restaurant with no menu at all, which is where an owner lands after
 * deleting their only menu, or on a new restaurant. Adding a section, adding a
 * dish with a new section, or importing a spreadsheet must each work from
 * there, and what they add must reach the public menu.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'zero-fixture';
const OTHER_SLUG = 'zero-other';
const EMAIL = 'zero-owner@example.test';

let owner = { id: '', role: 'SUPER_ADMIN' as const };
let businessId = '';
let publicId = '';
let otherBusinessId = '';

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function makeBusiness(slug: string, nameAr: string) {
  return createBusiness(owner, {
    slug,
    type: 'RESTAURANT',
    status: 'ACTIVE',
    defaultLocale: 'ar',
    currency: 'SAR',
    nameAr,
    nameEn: slug,
  } as Parameters<typeof createBusiness>[1]);
}

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await removeFixture();
  owner = { id: (await prisma.user.create({ data: { email: EMAIL, name: 'Owner', role: 'SUPER_ADMIN' } })).id, role: 'SUPER_ADMIN' };
  const business = await makeBusiness(SLUG, 'مطعم الصفر');
  businessId = business.id;
  publicId = business.publicId;
  otherBusinessId = (await makeBusiness(OTHER_SLUG, 'مطعم آخر')).id;
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

// Every test starts from a restaurant with no menu, no sections and no dishes.
beforeEach(async () => {
  if (!databaseReachable) return;
  await prisma.menu.deleteMany({ where: { businessId } });
  await prisma.deletedRecord.deleteMany({ where: { businessId } });
});

const run = databaseReachable ? describe : describe.skip;

run('starting from a restaurant with no menu', () => {
  it('adding a section creates the menu, publishes it, and the section is on it', async () => {
    const section = await createSection(owner, businessId, { nameAr: 'المشويات', nameEn: 'Grills' });
    expect(section.menuCreated).toBe(true);

    const menus = await prisma.menu.findMany({ where: { businessId }, include: { categories: true } });
    expect(menus).toHaveLength(1);
    expect(menus[0]).toMatchObject({ key: 'main', status: 'ACTIVE' });
    expect(menus[0]!.currentVersionId).not.toBeNull();
    expect(menus[0]!.categories.map((category) => category.nameAr)).toEqual(['المشويات']);
  });

  it('a second section goes into the same menu, and a repeated name is refused', async () => {
    await createSection(owner, businessId, { nameAr: 'المشويات' });
    const second = await createSection(owner, businessId, { nameAr: 'المشروبات' });
    expect(second.menuCreated).toBe(false);
    expect(await prisma.menu.count({ where: { businessId } })).toBe(1);
    await expect(createSection(owner, businessId, { nameAr: 'المشويات' })).rejects.toBeInstanceOf(ValidationError);
    await expect(createSection(owner, businessId, { nameAr: '   ' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('a dish can name a new section, and it reaches the public menu at once', async () => {
    const dish = await createDish(owner, businessId, { newSection: 'الحلويات', nameAr: 'كنافة', price: '18' });
    const section = await prisma.menuCategory.findFirstOrThrow({ where: { businessId, nameAr: 'الحلويات' } });
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: dish.id } })).categoryId).toBe(section.id);

    const profile = await getPublicProfile(publicId);
    const names = profile?.menus.flatMap((menu) => menu.categories.flatMap((category) => category.items.map((item) => item.nameAr)));
    expect(names).toContain('كنافة');
  });

  it('a dish with neither a section nor a new section name is refused', async () => {
    await expect(createDish(owner, businessId, { nameAr: 'طبق' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('the menu it creates keeps clear of a deleted menu, which can still be restored', async () => {
    await createSection(owner, businessId, { nameAr: 'قديم' });
    const old = await prisma.menu.findFirstOrThrow({ where: { businessId } });
    const { recordId } = await deleteMenu(owner, businessId, old.id, old.key);

    const fresh = await createSection(owner, businessId, { nameAr: 'جديد' });
    const created = await prisma.menu.findUniqueOrThrow({ where: { id: fresh.menuId } });
    expect(created.key).toBe('main-2');

    await restoreDeletedRecord(owner, businessId, recordId);
    expect((await prisma.menu.findMany({ where: { businessId }, orderBy: { key: 'asc' } })).map((menu) => menu.key)).toEqual(['main', 'main-2']);
  });

  it('an empty section can be removed; one with dishes cannot, and nothing is lost', async () => {
    const empty = await createSection(owner, businessId, { nameAr: 'فارغ' });
    await deleteSection(owner, businessId, empty.id);
    expect(await prisma.menuCategory.count({ where: { id: empty.id } })).toBe(0);

    const dish = await createDish(owner, businessId, { newSection: 'ممتلئ', nameAr: 'شاورما', price: '10' });
    const full = await prisma.menuCategory.findFirstOrThrow({ where: { businessId, nameAr: 'ممتلئ' } });
    await expect(deleteSection(owner, businessId, full.id)).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.menuItem.count({ where: { id: dish.id } })).toBe(1);
  });

  it('cannot remove a section of another restaurant', async () => {
    const theirs = await createSection(owner, otherBusinessId, { nameAr: 'قسمهم' });
    await expect(deleteSection(owner, businessId, theirs.id)).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.menuCategory.count({ where: { id: theirs.id } })).toBe(1);
  });

  it('a non-member cannot add a section', async () => {
    const stranger = await prisma.user.create({ data: { email: `zero-stranger-${Date.now()}@example.test`, name: 'Stranger', role: 'STAFF' } });
    try {
      await expect(createSection({ id: stranger.id, role: 'STAFF' }, businessId, { nameAr: 'قسم' })).rejects.toBeInstanceOf(TenantAccessError);
    } finally {
      await prisma.user.delete({ where: { id: stranger.id } });
    }
  });

  it('a spreadsheet imports into a restaurant with no menu, even with the restaurant name in its menu column', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Menu');
    sheet.addRow(['item_id', 'category_ar', 'item_name_ar', 'price', 'menu']);
    sheet.addRow(['', 'المشويات', 'شيش طاووق', '25', 'مطعم الصفر']);
    sheet.addRow(['', 'المشروبات', 'عصير برتقال', '9', 'مطعم الصفر']);
    const parsed = await parseSpreadsheet(new Uint8Array(await book.xlsx.writeBuffer()), 'menu.xlsx');
    const summary = validateRows({
      currency: 'SAR',
      mapping: parsed.suggestedMapping,
      rows: parsed.rows,
      rowNumbers: parsed.rowNumbers,
      menus: [],
      businessNames: ['مطعم الصفر', SLUG],
    });
    expect(summary.invalidCount).toBe(0);

    const result = await executeImport(owner, businessId, {
      fileName: 'menu.xlsx',
      defaultMenuKey: 'main',
      mapping: {},
      duplicateStrategy: 'update',
      rows: summary.rows,
    });
    expect(result).toMatchObject({ created: 2, errors: 0 });

    const menus = await prisma.menu.findMany({ where: { businessId }, include: { categories: { include: { items: true } } } });
    expect(menus).toHaveLength(1);
    expect(menus[0]!.currentVersionId).not.toBeNull();
    expect(menus[0]!.categories.flatMap((category) => category.items.map((item) => item.nameAr)).sort()).toEqual(['شيش طاووق', 'عصير برتقال']);
  });
});
