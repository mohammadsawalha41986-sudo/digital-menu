import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import {
  createBusiness,
  createCategory,
  deleteCategory,
  newItemCode,
  renameCategory,
  upsertItem,
} from '@/server/admin/business-service';
import { categoryCreateSchema, itemSchema } from '@/server/admin/validation';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import { isValidKey } from '@/lib/keys';
import { resolveDatabase } from '../database';

/**
 * Step 7, the menu builder: sections and dishes as an owner makes them.
 * The section form sends names only — never a key — and that used to fail
 * with "key: Invalid input: expected string, received undefined".
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'builder-fixture';
const KWD_SLUG = 'builder-kwd';
const EMAIL = 'builder-fixture@example.test';
const OTHER_EMAIL = 'builder-other@example.test';

let businessId = '';
let kwdBusinessId = '';
let menuId = '';
let dinnerId = '';
let user = { id: '', role: 'SUPER_ADMIN' as const };
let outsider = { id: '', role: 'STAFF' as const };

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: { in: [SLUG, KWD_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
}

/** What the builder's section form actually posts: names, no key. */
const sectionForm = (nameAr: string, nameEn = '') =>
  categoryCreateSchema.parse({ nameAr, nameEn, descriptionAr: '', descriptionEn: '' });

const dish = (overrides: Partial<Record<string, string>>) =>
  itemSchema.parse({
    itemCode: 'B-1',
    categoryKey: 'x',
    nameAr: 'طبق',
    nameEn: '',
    descriptionAr: '',
    descriptionEn: '',
    price: '',
    calories: '',
    availability: 'AVAILABLE',
    ...overrides,
  });

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await removeFixture();

  const staff = await prisma.user.create({ data: { email: EMAIL, name: 'Builder', role: 'SUPER_ADMIN' } });
  user = { id: staff.id, role: 'SUPER_ADMIN' };
  const other = await prisma.user.create({ data: { email: OTHER_EMAIL, name: 'Other', role: 'STAFF' } });
  outsider = { id: other.id, role: 'STAFF' };

  const make = (slug: string, currency: string) =>
    createBusiness(user, {
      slug,
      type: 'RESTAURANT',
      status: 'ACTIVE',
      defaultLocale: 'ar',
      currency,
      nameAr: 'مطعم',
      nameEn: slug,
    } as Parameters<typeof createBusiness>[1]);

  businessId = (await make(SLUG, 'SAR')).id;
  kwdBusinessId = (await make(KWD_SLUG, 'KWD')).id;
  menuId = (await prisma.menu.create({ data: { businessId, key: 'main', titleAr: 'القائمة', status: 'ACTIVE' } })).id;
  dinnerId = (await prisma.menu.create({ data: { businessId, key: 'dinner', titleAr: 'العشاء', status: 'ACTIVE' } })).id;
  await prisma.menuCategory.create({
    data: { menuId, businessId, key: 'main', nameAr: 'الرئيسية', nameEn: 'Main', sortOrder: 0 },
  });
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

describe('the section form', () => {
  it('validates without a key (the cause of “key: expected string, received undefined”)', () => {
    const parsed = categoryCreateSchema.safeParse({ nameAr: 'دجاج الشواية', nameEn: 'Grilled chicken' });
    expect(parsed.success).toBe(true);
  });
});

describe.skipIf(!databaseReachable)('menu builder', () => {
  it('creates sections beside the default Main one, with keys made from their names', async () => {
    const english = await createCategory(user, businessId, menuId, sectionForm('دجاج الشواية', 'Grilled Chicken'));
    const arabic = await createCategory(user, businessId, menuId, sectionForm('الأرز'));

    expect(english.key).toBe('grilled-chicken');
    expect(isValidKey(arabic.key)).toBe(true);
    expect(arabic.key).toMatch(/^s-[a-z0-9]+$/);
    // Arabic is stored as typed, and each new section goes after the others.
    const stored = await prisma.menuCategory.findMany({ where: { menuId }, orderBy: { sortOrder: 'asc' } });
    expect(stored.map((row) => row.nameAr)).toEqual(['الرئيسية', 'دجاج الشواية', 'الأرز']);
  });

  it('refuses a second section with the same name, and keeps keys unique', async () => {
    await expect(createCategory(user, businessId, menuId, sectionForm(' الأرز '))).rejects.toThrow(/already exists/);
    const again = await createCategory(user, businessId, menuId, sectionForm('دجاج مشوي', 'Grilled chicken'));
    expect(again.key).toBe('grilled-chicken-2');
  });

  it('renames a section without touching its key, order or description', async () => {
    const section = await prisma.menuCategory.findFirstOrThrow({ where: { menuId, key: 'grilled-chicken' } });
    await prisma.menuCategory.update({ where: { id: section.id }, data: { descriptionAr: 'على الفحم' } });

    await renameCategory(user, businessId, section.id, { nameAr: 'دجاج على الفحم', nameEn: 'Charcoal chicken' });

    const after = await prisma.menuCategory.findUniqueOrThrow({ where: { id: section.id } });
    expect([after.key, after.nameAr, after.nameEn, after.sortOrder, after.descriptionAr]).toEqual([
      'grilled-chicken',
      'دجاج على الفحم',
      'Charcoal chicken',
      section.sortOrder,
      'على الفحم',
    ]);
    await expect(renameCategory(user, businessId, section.id, { nameAr: 'الأرز', nameEn: null })).rejects.toThrow(
      /already exists/,
    );
  });

  it('adds a dish to the chosen section with a decimal price kept exactly', async () => {
    await upsertItem(user, businessId, dish({ itemCode: 'B-1', categoryKey: 'grilled-chicken', price: '23.50', nameAr: 'نصف دجاج' }));
    const row = await prisma.menuItem.findUniqueOrThrow({
      where: { businessId_itemCode: { businessId, itemCode: 'B-1' } },
      include: { category: true },
    });
    expect([row.priceMinor, row.category.key, row.nameAr]).toEqual([2350, 'grilled-chicken', 'نصف دجاج']);
  });

  it('keeps three decimals for KWD and refuses an unreadable price instead of storing zero', async () => {
    const kwdMenu = await prisma.menu.create({ data: { businessId: kwdBusinessId, key: 'main', titleAr: 'ق', status: 'ACTIVE' } });
    await createCategory(user, kwdBusinessId, kwdMenu.id, sectionForm('مشروبات', 'Drinks'));
    await upsertItem(user, kwdBusinessId, dish({ itemCode: 'K-1', categoryKey: 'drinks', price: '1.250' }));
    const row = await prisma.menuItem.findUniqueOrThrow({
      where: { businessId_itemCode: { businessId: kwdBusinessId, itemCode: 'K-1' } },
    });
    expect(row.priceMinor).toBe(1250);

    await expect(
      upsertItem(user, kwdBusinessId, dish({ itemCode: 'K-2', categoryKey: 'drinks', price: 'twelve' })),
    ).rejects.toThrow(/price/);
    expect(await prisma.menuItem.count({ where: { businessId: kwdBusinessId, itemCode: 'K-2' } })).toBe(0);
  });

  it('puts a dish in the right menu when two menus share a section key', async () => {
    await createCategory(user, businessId, dinnerId, sectionForm('مشويات العشاء', 'Grilled chicken'));
    const dinnerSection = await prisma.menuCategory.findFirstOrThrow({ where: { menuId: dinnerId } });
    expect(dinnerSection.key).toBe('grilled-chicken');

    await upsertItem(user, businessId, { ...dish({ itemCode: 'B-2', categoryKey: 'grilled-chicken' }), menuId: dinnerId });
    const row = await prisma.menuItem.findUniqueOrThrow({
      where: { businessId_itemCode: { businessId, itemCode: 'B-2' } },
    });
    expect(row.categoryId).toBe(dinnerSection.id);

    // Without a menu, an existing dish stays in its own menu ...
    await upsertItem(user, businessId, dish({ itemCode: 'B-1', categoryKey: 'grilled-chicken', price: '24' }));
    const kept = await prisma.menuItem.findUniqueOrThrow({
      where: { businessId_itemCode: { businessId, itemCode: 'B-1' } },
      include: { category: true },
    });
    expect(kept.category.menuId).toBe(menuId);
    // ... and a new one is refused rather than guessed.
    await expect(
      upsertItem(user, businessId, dish({ itemCode: 'B-3', categoryKey: 'grilled-chicken' })),
    ).rejects.toThrow(/more than one menu/);
  });

  it('gives a new dish a code no dish has', async () => {
    const codes = await Promise.all(Array.from({ length: 5 }, () => newItemCode(user, businessId)));
    expect(new Set(codes).size).toBe(5);
    expect(await prisma.menuItem.count({ where: { businessId, itemCode: { in: codes } } })).toBe(0);
  });

  it('deletes an empty section, and refuses one that still has dishes', async () => {
    const full = await prisma.menuCategory.findFirstOrThrow({ where: { menuId, key: 'grilled-chicken' } });
    await expect(deleteCategory(user, businessId, full.id)).rejects.toThrow(/still has 1 dish/);
    expect(await prisma.menuItem.count({ where: { categoryId: full.id } })).toBe(1);

    const empty = await prisma.menuCategory.findFirstOrThrow({ where: { menuId, key: 'grilled-chicken-2' } });
    await deleteCategory(user, businessId, empty.id);
    expect(await prisma.menuCategory.count({ where: { id: empty.id } })).toBe(0);
  });

  it('refuses another tenant everywhere', async () => {
    const section = await prisma.menuCategory.findFirstOrThrow({ where: { menuId, key: 'grilled-chicken' } });
    await expect(createCategory(outsider, businessId, menuId, sectionForm('x'))).rejects.toBeInstanceOf(TenantAccessError);
    await expect(renameCategory(outsider, businessId, section.id, { nameAr: 'x', nameEn: null })).rejects.toBeInstanceOf(
      TenantAccessError,
    );
    // A section id from one restaurant used under another restaurant's id.
    await expect(renameCategory(user, kwdBusinessId, section.id, { nameAr: 'x', nameEn: null })).rejects.toBeInstanceOf(
      TenantAccessError,
    );
  });
});
