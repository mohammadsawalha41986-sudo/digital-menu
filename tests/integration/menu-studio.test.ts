import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getMenuDesign, updateMenuDesign } from '@/server/menu-studio/design';
import {
  deleteModifierGroup,
  getItemModifiers,
  listModifierGroups,
  saveModifierGroup,
  setItemModifiers,
} from '@/server/menu-studio/modifiers';
import { TenantAccessError, type AuthenticatedUser } from '@/server/tenancy/context';

/**
 * The Menu Studio's central promise, made executable (Menu Studio §4):
 *
 *   "Changing the theme must preserve items, categories, prices, descriptions,
 *    images and modifiers. Only presentation changes."
 *
 * So the test snapshots the entire menu, switches theme, layout, every
 * typography role and every display toggle, and asserts the snapshot is
 * unchanged. If a design write ever reaches menu data, this fails.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const PUBLIC_ID = 'STD001';
const OTHER_PUBLIC_ID = 'STD002';
const OWNER_EMAIL = 'studio-owner@example.test';
const OUTSIDER_EMAIL = 'studio-outsider@example.test';

let businessId = '';
let otherBusinessId = '';
let menuId = '';
let user: AuthenticatedUser = { id: '', role: 'STAFF' };
let outsider: AuthenticatedUser = { id: '', role: 'STAFF' };

async function cleanup() {
  await prisma.business.deleteMany({ where: { publicId: { in: [PUBLIC_ID, OTHER_PUBLIC_ID] } } });
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OUTSIDER_EMAIL] } } });
}

/** Everything a visitor would notice. The design must not disturb any of it. */
async function snapshotMenu() {
  const categories = await prisma.menuCategory.findMany({
    where: { menuId },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });

  return JSON.stringify(
    categories.map((category) => ({
      key: category.key,
      nameAr: category.nameAr,
      parentId: category.parentId,
      items: category.items.map((item) => ({
        code: item.itemCode,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        descriptionAr: item.descriptionAr,
        priceMinor: item.priceMinor,
        costMinor: item.costMinor,
        calories: item.calories,
        tags: item.tags,
        allergens: item.allergens,
        imageMediaId: item.imageMediaId,
        availability: item.availability,
        modifiers: item.modifiers.map((link) => link.groupId),
      })),
    })),
  );
}

beforeAll(async () => {
  if (!databaseReachable) return;
  await cleanup();

  const business = await prisma.business.create({
    data: {
      publicId: PUBLIC_ID,
      slug: 'studio-fixture',
      type: 'RESTAURANT',
      status: 'ACTIVE',
      nameAr: 'مطعم الاستوديو',
      nameEn: 'Studio Fixture',
    },
  });
  businessId = business.id;

  const other = await prisma.business.create({
    data: { publicId: OTHER_PUBLIC_ID, slug: 'studio-other', nameAr: 'آخر' },
  });
  otherBusinessId = other.id;

  const menu = await prisma.menu.create({
    data: { businessId, key: 'main', status: 'ACTIVE', titleAr: 'المنيو' },
  });
  menuId = menu.id;

  const mains = await prisma.menuCategory.create({
    data: { menuId, businessId, key: 'mains', nameAr: 'الأطباق الرئيسية', sortOrder: 0 },
  });

  // A subcategory, to prove the one-level hierarchy survives a design change.
  await prisma.menuCategory.create({
    data: {
      menuId,
      businessId,
      key: 'grill',
      nameAr: 'من الشواية',
      sortOrder: 1,
      parentId: mains.id,
    },
  });

  await prisma.menuItem.create({
    data: {
      categoryId: mains.id,
      businessId,
      itemCode: 'ST-001',
      nameAr: 'برجر',
      nameEn: 'Burger',
      descriptionAr: 'مع الجبن',
      priceMinor: 3800,
      costMinor: 1200,
      calories: 680,
      tags: ['popular', 'spicy'],
      allergens: ['gluten'],
    },
  });

  const [owner, stranger] = await Promise.all([
    prisma.user.create({ data: { email: OWNER_EMAIL, name: 'Owner', role: 'STAFF' } }),
    prisma.user.create({ data: { email: OUTSIDER_EMAIL, name: 'Stranger', role: 'STAFF' } }),
  ]);

  user = { id: owner.id, role: 'STAFF' };
  outsider = { id: stranger.id, role: 'STAFF' };

  await prisma.businessMembership.create({
    data: { userId: owner.id, businessId, role: 'OWNER' },
  });
});

afterAll(async () => {
  if (databaseReachable) await cleanup();
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('menu design', () => {
  it('starts every menu in a real theme rather than in nothing', async () => {
    const design = await getMenuDesign(user, businessId, menuId);

    expect(design.themeKey).toBe('modern-minimal');
    expect(design.resolved.layout.key).toBe('a');
  });

  it('changes theme, layout, typography and toggles without touching the menu', async () => {
    const before = await snapshotMenu();

    await updateMenuDesign(user, businessId, menuId, {
      themeKey: 'dark-luxury',
      layoutKey: 'b',
      fontHeading: 'arabic-kufi',
      fontBody: 'arabic-naskh',
      fontPrice: 'system-mono',
      fontAccent: 'system-serif',
      imageStyle: 'circle',
      density: 'airy',
      showPrices: false,
      showImages: false,
      showCalories: false,
    });

    // The single most important assertion in the Menu Studio.
    expect(await snapshotMenu()).toBe(before);

    const design = await getMenuDesign(user, businessId, menuId);
    expect(design.themeKey).toBe('dark-luxury');
    expect(design.fonts.heading).toBe('arabic-kufi');
    expect(design.showPrices).toBe(false);
  });

  it('resets the layout when the theme changes, since layouts belong to a theme', async () => {
    await updateMenuDesign(user, businessId, menuId, { themeKey: 'bold-street' });
    const design = await getMenuDesign(user, businessId, menuId);

    expect(design.themeKey).toBe('bold-street');
    expect(design.layoutKey).toBe('a');
  });

  it('refuses a theme the platform does not have', async () => {
    await expect(
      updateMenuDesign(user, businessId, menuId, { themeKey: 'not-a-theme' }),
    ).rejects.toThrow(/not a theme/i);
  });

  it('refuses a font in a role it is not made for', async () => {
    await expect(
      updateMenuDesign(user, businessId, menuId, { fontHeading: 'system-mono' }),
    ).rejects.toThrow(/not a font available/i);
  });

  it('refuses a design change from someone with no grant', async () => {
    await expect(
      updateMenuDesign(outsider, businessId, menuId, { themeKey: 'fine-dining' }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });

  it('refuses to design another tenant’s menu even with a real menu id', async () => {
    const foreignMenu = await prisma.menu.create({
      data: { businessId: otherBusinessId, key: 'main', titleAr: 'قائمة' },
    });

    await expect(
      updateMenuDesign(user, businessId, foreignMenu.id, { themeKey: 'fine-dining' }),
    ).rejects.toThrow(/does not exist/i);
  });
});

describe.skipIf(!databaseReachable)('modifiers', () => {
  it('saves a group with its options and reads it back in order', async () => {
    await saveModifierGroup(user, businessId, {
      key: 'size',
      nameAr: 'الحجم',
      nameEn: 'Size',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { key: 'regular', nameAr: 'عادي', priceDeltaMinor: 0, isDefault: true },
        { key: 'large', nameAr: 'كبير', priceDeltaMinor: 300 },
      ],
    });

    const [group] = await listModifierGroups(user, businessId);

    expect(group?.key).toBe('size');
    expect(group?.options.map((option) => option.key)).toEqual(['regular', 'large']);
    expect(group?.options[1]?.priceDeltaMinor).toBe(300);
  });

  it('replaces options wholesale rather than leaving orphans behind', async () => {
    await saveModifierGroup(user, businessId, {
      key: 'size',
      nameAr: 'الحجم',
      minSelect: 1,
      maxSelect: 1,
      options: [{ key: 'one-size', nameAr: 'حجم واحد' }],
    });

    const [group] = await listModifierGroups(user, businessId);
    expect(group?.options.map((option) => option.key)).toEqual(['one-size']);
  });

  it('refuses a group that can never be satisfied', async () => {
    await expect(
      saveModifierGroup(user, businessId, {
        key: 'broken',
        nameAr: 'خطأ',
        minSelect: 3,
        maxSelect: 1,
        options: [{ key: 'a', nameAr: 'أ' }],
      }),
    ).rejects.toThrow(/minimum cannot exceed/i);

    await expect(
      saveModifierGroup(user, businessId, {
        key: 'empty',
        nameAr: 'فارغ',
        options: [],
      }),
    ).rejects.toThrow(/at least one option/i);

    await expect(
      saveModifierGroup(user, businessId, {
        key: 'too-many-defaults',
        nameAr: 'كثير',
        maxSelect: 1,
        options: [
          { key: 'a', nameAr: 'أ', isDefault: true },
          { key: 'b', nameAr: 'ب', isDefault: true },
        ],
      }),
    ).rejects.toThrow(/default than the group allows/i);
  });

  it('attaches groups to an item in the order given', async () => {
    await saveModifierGroup(user, businessId, {
      key: 'extras',
      nameAr: 'إضافات',
      maxSelect: 3,
      options: [{ key: 'cheese', nameAr: 'جبن', priceDeltaMinor: 200 }],
    });

    await setItemModifiers(user, businessId, 'ST-001', ['extras', 'size']);

    const item = await prisma.menuItem.findFirstOrThrow({
      where: { businessId, itemCode: 'ST-001' },
    });
    const groups = await getItemModifiers(businessId, item.id);

    expect(groups.map((group) => group.key)).toEqual(['extras', 'size']);
    expect(groups[1]?.required).toBe(true);
  });

  it('refuses to attach a group belonging to another business', async () => {
    const foreign = await prisma.modifierGroup.create({
      data: { businessId: otherBusinessId, key: 'foreign', nameAr: 'غريب' },
    });
    await prisma.modifierOption.create({
      data: { groupId: foreign.id, businessId: otherBusinessId, key: 'x', nameAr: 'س' },
    });

    // The key exists — in someone else's account. Resolution is tenant-scoped,
    // so it is simply not found here.
    await expect(setItemModifiers(user, businessId, 'ST-001', ['foreign'])).rejects.toThrow(
      /no modifier group/i,
    );
  });

  it('hides inactive groups and options from the public menu', async () => {
    await saveModifierGroup(user, businessId, {
      key: 'extras',
      nameAr: 'إضافات',
      maxSelect: 3,
      isActive: false,
      options: [{ key: 'cheese', nameAr: 'جبن', priceDeltaMinor: 200 }],
    });

    const item = await prisma.menuItem.findFirstOrThrow({
      where: { businessId, itemCode: 'ST-001' },
    });

    expect((await getItemModifiers(businessId, item.id)).map((group) => group.key)).toEqual([
      'size',
    ]);
  });

  it('deleting a group detaches it instead of leaving a dangling item', async () => {
    await deleteModifierGroup(user, businessId, 'size');

    const item = await prisma.menuItem.findFirstOrThrow({
      where: { businessId, itemCode: 'ST-001' },
    });

    expect(await getItemModifiers(businessId, item.id)).toEqual([]);
    expect(await prisma.menuItem.count({ where: { businessId, itemCode: 'ST-001' } })).toBe(1);
  });
});

describe.skipIf(!databaseReachable)('the design reaches the public menu', () => {
  it('publishes the chosen theme, layout and fonts with the menu', async () => {
    const { getPublicProfile } = await import('@/server/profile/repository');

    const version = await prisma.menuVersion.create({
      data: { menuId, version: 1, publishedAt: new Date() },
    });
    await prisma.menu.update({ where: { id: menuId }, data: { currentVersionId: version.id } });

    await updateMenuDesign(user, businessId, menuId, {
      themeKey: 'arabic-contemporary',
      layoutKey: 'b',
      fontHeading: 'arabic-kufi',
      showPrices: true,
      showImages: true,
      showCalories: true,
    });

    const profile = await getPublicProfile(PUBLIC_ID);
    const design = profile?.menus[0]?.design;

    expect(design?.themeKey).toBe('arabic-contemporary');
    expect(design?.layoutKey).toBe('b');
    // Resolved to a stack, not left as a key the browser cannot use.
    expect(design?.fonts.heading).toMatch(/Kufi/);
    expect(design?.itemStyle).toBe('row');
  });

  it('hides a price by leaving it out of the page, not by covering it', async () => {
    const { getPublicProfile } = await import('@/server/profile/repository');

    await updateMenuDesign(user, businessId, menuId, {
      showPrices: false,
      showCalories: false,
      showImages: false,
    });

    const profile = await getPublicProfile(PUBLIC_ID);
    const item = profile?.menus[0]?.categories.flatMap((category) => category.items)[0];

    expect(item).toBeDefined();
    expect(item?.priceMinor).toBeNull();
    expect(item?.calories).toBeNull();
    expect(item?.image).toBeNull();
    // A hidden price is absent from the payload entirely.
    expect(JSON.stringify(profile?.menus[0])).not.toContain('3800');

    // And the row still holds it: hiding is presentation, not deletion.
    const row = await prisma.menuItem.findFirstOrThrow({
      where: { businessId, itemCode: 'ST-001' },
    });
    expect(row.priceMinor).toBe(3800);
    expect(row.calories).toBe(680);
  });

  it('restores what was hidden when the toggle goes back', async () => {
    const { getPublicProfile } = await import('@/server/profile/repository');

    await updateMenuDesign(user, businessId, menuId, {
      showPrices: true,
      showCalories: true,
      showImages: true,
    });

    const profile = await getPublicProfile(PUBLIC_ID);
    const item = profile?.menus[0]?.categories.flatMap((category) => category.items)[0];

    expect(item?.priceMinor).toBe(3800);
    expect(item?.calories).toBe(680);
  });

  it('falls back to a real theme when a menu has no design row at all', async () => {
    const { getPublicProfile } = await import('@/server/profile/repository');

    await prisma.menuDesign.deleteMany({ where: { menuId } });

    const profile = await getPublicProfile(PUBLIC_ID);
    const design = profile?.menus[0]?.design;

    expect(design?.themeKey).toBe('modern-minimal');
    expect(design?.fonts.body.length).toBeGreaterThan(0);
    expect(design?.showPrices).toBe(true);
  });
});
