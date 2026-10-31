import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness } from '@/server/admin/business-service';
import { planMenuText, saveMenuText } from '@/server/admin/menu-text-import';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import { isValidKey } from '@/lib/keys';
import { resolveDatabase } from '../database';

/** Step 5's paste path against the database: preview, save, paste again. */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'paste-fixture';
const EMAIL = 'paste-fixture@example.test';
const OTHER_EMAIL = 'paste-other@example.test';

let businessId = '';
let user = { id: '', role: 'SUPER_ADMIN' as const };
let outsider = { id: '', role: 'STAFF' as const };

const EXAMPLE = [
  'دجاج الشواية',
  'نصف دجاج شواية مع الأرز | 23 | نصف دجاج شواية مع أرز',
  'حبة دجاج شواية مع الأرز | 44 | حبة دجاج شواية مع أرز',
  'الأرز',
  'أرز بخاري | 8',
  'أرز برياني | 8',
].join('\n');

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: SLUG } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
}

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await removeFixture();
  const staff = await prisma.user.create({ data: { email: EMAIL, name: 'Paste', role: 'SUPER_ADMIN' } });
  user = { id: staff.id, role: 'SUPER_ADMIN' };
  const other = await prisma.user.create({ data: { email: OTHER_EMAIL, name: 'Other', role: 'STAFF' } });
  outsider = { id: other.id, role: 'STAFF' };
  businessId = (
    await createBusiness(user, {
      slug: SLUG,
      type: 'RESTAURANT',
      status: 'ACTIVE',
      defaultLocale: 'ar',
      currency: 'SAR',
      nameAr: 'مطعم',
      nameEn: SLUG,
    } as Parameters<typeof createBusiness>[1])
  ).id;
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

const dishes = () =>
  prisma.menuItem.findMany({ where: { businessId }, include: { category: true }, orderBy: { nameAr: 'asc' } });

describe.skipIf(!databaseReachable)('pasting a menu', () => {
  it('previews without writing anything', async () => {
    const plan = await planMenuText(user, businessId, EXAMPLE);
    expect(plan.counts).toEqual({ new: 4, update: 0, same: 0 });
    expect(plan.sections.map((section) => [section.name, section.isNew])).toEqual([
      ['دجاج الشواية', true],
      ['الأرز', true],
    ]);
    expect(await prisma.menuItem.count({ where: { businessId } })).toBe(0);
  });

  it('saves sections with valid keys and dishes with their prices and descriptions', async () => {
    await saveMenuText(user, businessId, EXAMPLE);
    const rows = await dishes();
    const seen = rows.map((row) => [row.category.nameAr, row.nameAr, row.priceMinor, row.descriptionAr]);
    expect(seen).toHaveLength(4);
    expect(seen).toEqual(expect.arrayContaining([
      ['الأرز', 'أرز برياني', 800, null],
      ['الأرز', 'أرز بخاري', 800, null],
      ['دجاج الشواية', 'حبة دجاج شواية مع الأرز', 4400, 'حبة دجاج شواية مع أرز'],
      ['دجاج الشواية', 'نصف دجاج شواية مع الأرز', 2300, 'نصف دجاج شواية مع أرز'],
    ]));
    expect(rows.every((row) => isValidKey(row.category.key))).toBe(true);
  });

  it('changes nothing when the same text is pasted again', async () => {
    const plan = await saveMenuText(user, businessId, EXAMPLE);
    expect(plan.counts).toEqual({ new: 0, update: 0, same: 4 });
    expect(await prisma.menuItem.count({ where: { businessId } })).toBe(4);
    expect(await prisma.menuCategory.count({ where: { businessId } })).toBe(2);
  });

  it('updates a corrected price and keeps what the text did not mention', async () => {
    const rice = await prisma.menuItem.findFirstOrThrow({ where: { businessId, nameAr: 'أرز بخاري' } });
    await prisma.menuItem.update({ where: { id: rice.id }, data: { nameEn: 'Bukhari rice', calories: 320 } });

    const plan = await saveMenuText(user, businessId, 'الأرز\nأرز بخاري | 9.50\nأرز كابلي | 10');
    expect(plan.counts).toEqual({ new: 1, update: 1, same: 0 });

    const after = await prisma.menuItem.findUniqueOrThrow({ where: { id: rice.id } });
    expect([after.priceMinor, after.nameEn, after.calories, after.itemCode]).toEqual([950, 'Bukhari rice', 320, rice.itemCode]);
    expect(await prisma.menuCategory.count({ where: { businessId, nameAr: 'الأرز' } })).toBe(1);
  });

  it('reports unreadable lines by number and saves the rest', async () => {
    const plan = await saveMenuText(user, businessId, 'مشروبات\nشاي | 3\nقهوة |\nعصير | غالي\nماء | 1.12345');
    expect(plan.problems.map((problem) => problem.line)).toEqual([3, 4, 5]);
    expect(await prisma.menuItem.count({ where: { businessId, category: { nameAr: 'مشروبات' } } })).toBe(1);
    expect(await prisma.menuItem.count({ where: { businessId, nameAr: 'قهوة' } })).toBe(0);
  });

  it('refuses another tenant', async () => {
    await expect(saveMenuText(outsider, businessId, EXAMPLE)).rejects.toBeInstanceOf(TenantAccessError);
    await expect(planMenuText(outsider, businessId, EXAMPLE)).rejects.toBeInstanceOf(TenantAccessError);
  });
});
