import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, createCategory } from '@/server/admin/business-service';
import { categoryCreateSchema } from '@/server/admin/validation';
import { parseSpreadsheet } from '@/server/import/parse';
import { validateRows } from '@/server/import/validate';
import { executeImport } from '@/server/import/execute';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import { isValidKey } from '@/lib/keys';
import { resolveDatabase } from '../database';

/**
 * Importing a restaurant's own menu file, in the shapes owners actually send:
 * the restaurant's name in the menu column, Arabic throughout, a missing
 * price here and there, and sections that already exist in the builder.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'import-rel-fixture';
const OTHER_SLUG = 'import-rel-other';
const EMAIL = 'import-rel@example.test';
const OTHER_EMAIL = 'import-rel-other@example.test';

let businessId = '';
let otherBusinessId = '';
let menuId = '';
let user = { id: '', role: 'SUPER_ADMIN' as const };
let outsider = { id: '', role: 'STAFF' as const };

const HEADERS = ['item_id', 'category_ar', 'category_en', 'item_name_ar', 'item_name_en', 'description_ar', 'price', 'menu'];
const RESTAURANT = 'أسد الحمراء البخاري | asad al hamra al bukhari';
const ROWS = [
  ['', 'دجاج الشواية', '', 'نصف دجاج شواية مع الأرز', '', 'نصف دجاج شواية مع أرز', '23', RESTAURANT],
  ['', 'دجاج الشواية', '', 'حبة دجاج شواية مع الأرز', '', '', '44', RESTAURANT],
  ['', 'الأرز', 'Rice', 'أرز بخاري', 'Bukhari rice', '', '8.50', RESTAURANT],
  ['', 'الأرز', 'Rice', 'أرز برياني', '', '', '', RESTAURANT],
  ['', 'الأرز', 'Rice', 'أرز مندي', '', '', '9', 'قائمة لا توجد'],
];

async function xlsx(rows: string[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Menu');
  sheet.addRow(HEADERS);
  rows.forEach((row) => sheet.addRow(row));
  return new Uint8Array(await book.xlsx.writeBuffer());
}

function csv(rows: string[][]) {
  const cell = (value: string) => (/[",\n|]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return new TextEncoder().encode([HEADERS, ...rows].map((row) => row.map(cell).join(',')).join('\n'));
}

async function preview(bytes: Uint8Array, fileName: string, forBusiness = businessId) {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: forBusiness },
    select: { currency: true, nameAr: true, nameEn: true, menus: { select: { key: true, titleAr: true, titleEn: true } } },
  });
  const parsed = await parseSpreadsheet(bytes, fileName);
  return validateRows({
    currency: business.currency,
    mapping: parsed.suggestedMapping,
    rows: parsed.rows,
    rowNumbers: parsed.rowNumbers,
    menus: business.menus,
    businessNames: [business.nameAr, business.nameEn ?? ''],
  });
}

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
}

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await removeFixture();

  const staff = await prisma.user.create({ data: { email: EMAIL, name: 'Import', role: 'SUPER_ADMIN' } });
  user = { id: staff.id, role: 'SUPER_ADMIN' };
  const other = await prisma.user.create({ data: { email: OTHER_EMAIL, name: 'Other', role: 'STAFF' } });
  outsider = { id: other.id, role: 'STAFF' };

  const make = (slug: string, nameAr: string, nameEn: string) =>
    createBusiness(user, {
      slug,
      type: 'RESTAURANT',
      status: 'ACTIVE',
      defaultLocale: 'ar',
      currency: 'SAR',
      nameAr,
      nameEn,
    } as Parameters<typeof createBusiness>[1]);

  businessId = (await make(SLUG, 'أسد الحمراء البخاري', 'Asad Al Hamra Al Bukhari')).id;
  otherBusinessId = (await make(OTHER_SLUG, 'مطعم آخر', 'Other')).id;
  menuId = (await prisma.menu.create({ data: { businessId, key: 'main', titleAr: 'المنيو', titleEn: 'Menu', status: 'ACTIVE' } })).id;
  await prisma.menu.create({ data: { businessId: otherBusinessId, key: 'main', titleAr: 'المنيو', status: 'ACTIVE' } });

  // A section the owner already made in the builder.
  await createCategory(user, businessId, menuId, categoryCreateSchema.parse({ nameAr: 'الأرز', nameEn: 'Rice' }));
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('importing a restaurant’s own file', () => {
  it('reads Arabic XLSX, resolves the restaurant name in the menu column, and flags bad rows in the preview', async () => {
    const summary = await preview(await xlsx(ROWS), 'menu.xlsx');

    expect(summary.rows.map((row) => row.nameAr)).toEqual(ROWS.map((row) => row[3]));
    // The restaurant's own name means "the menu chosen for this import".
    expect(summary.rows.slice(0, 3).every((row) => row.valid && row.menuKey === null)).toBe(true);
    // A missing price is an error on its row, never a zero.
    const noPrice = summary.rows[3]!;
    expect(noPrice.valid).toBe(false);
    expect(noPrice.priceMinor).toBeNull();
    expect(noPrice.issues.map((issue) => issue.problem)).toContain('Price is required');
    // A menu that is not this restaurant's is reported on its row, in the preview.
    const unknown = summary.rows[4]!;
    expect(unknown.valid).toBe(false);
    expect(unknown.issues.map((issue) => issue.problem).join()).toMatch(/Unknown menu “قائمة لا توجد”/);
    expect(summary.validCount).toBe(3);
  });

  it('matches a menu by its key or by its title', async () => {
    const byKey = await preview(csv([[...ROWS[0]!.slice(0, 7), 'MAIN']]), 'a.csv');
    const byTitle = await preview(csv([[...ROWS[0]!.slice(0, 7), 'المنيو | Menu']]), 'b.csv');
    expect(byKey.rows[0]?.menuKey).toBe('main');
    expect(byTitle.rows[0]?.menuKey).toBe('main');
  });

  it('imports the valid rows of a CSV into existing sections, keeps Arabic, and reports the rest', async () => {
    const summary = await preview(csv(ROWS), 'menu.csv');
    const result = await executeImport(user, businessId, {
      fileName: 'menu.csv',
      defaultMenuKey: 'main',
      mapping: {},
      duplicateStrategy: 'update',
      rows: summary.rows,
    });
    expect([result.created, result.errors]).toEqual([3, 2]);

    const sections = await prisma.menuCategory.findMany({ where: { menuId }, include: { items: true } });
    // "الأرز" from the builder took the rice; no second "الأرز" was made.
    expect(sections.filter((section) => section.nameAr === 'الأرز')).toHaveLength(1);
    expect(sections.every((section) => isValidKey(section.key))).toBe(true);
    const items = sections.flatMap((section) => section.items);
    expect(items.map((item) => [item.nameAr, item.priceMinor]).sort()).toEqual(
      [
        ['أرز بخاري', 850],
        ['حبة دجاج شواية مع الأرز', 4400],
        ['نصف دجاج شواية مع الأرز', 2300],
      ].sort(),
    );
  });

  it('updates instead of duplicating when the same file is imported again', async () => {
    const summary = await preview(csv(ROWS), 'menu.csv');
    const result = await executeImport(user, businessId, {
      fileName: 'menu.csv',
      defaultMenuKey: 'main',
      mapping: {},
      duplicateStrategy: 'update',
      rows: summary.rows,
    });
    expect(result.created).toBe(0);
    expect(await prisma.menuItem.count({ where: { businessId } })).toBe(3);
  });

  it('flags a code used twice in one file', async () => {
    const summary = await preview(
      csv([
        ['R-1', 'الأرز', '', 'أرز أبيض', '', '', '7', ''],
        ['R-1', 'الأرز', '', 'أرز أصفر', '', '', '7', ''],
      ]),
      'dupes.csv',
    );
    expect(summary.duplicateCodes).toEqual(['R-1']);
    expect(summary.rows[1]?.valid).toBe(false);
  });

  it('refuses a row whose price was blanked after the preview', async () => {
    const summary = await preview(csv([['', 'الأرز', '', 'أرز كابلي', '', '', '12', '']]), 'tamper.csv');
    const tampered = summary.rows.map((row) => ({ ...row, priceMinor: null }));
    const result = await executeImport(user, businessId, {
      fileName: 'tamper.csv',
      defaultMenuKey: 'main',
      mapping: {},
      duplicateStrategy: 'update',
      rows: tampered,
    });
    expect([result.created, result.errors]).toEqual([0, 1]);
    expect(await prisma.menuItem.count({ where: { businessId, nameAr: 'أرز كابلي' } })).toBe(0);
  });

  it('never imports into another restaurant, and refuses an outsider', async () => {
    // This restaurant's name is unknown to the other one's menus.
    const summary = await preview(csv(ROWS.slice(0, 1)), 'x.csv', otherBusinessId);
    expect(summary.rows[0]?.valid).toBe(false);

    await expect(
      executeImport(outsider, businessId, {
        fileName: 'x.csv',
        defaultMenuKey: 'main',
        mapping: {},
        duplicateStrategy: 'update',
        rows: [],
      }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});
