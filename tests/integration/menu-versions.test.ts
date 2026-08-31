import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import {
  createBusiness,
  getMenuVersions,
  getPendingChanges,
  publishMenu,
  restoreMenuVersion,
} from '@/server/admin/business-service';
import { getPublicProfile } from '@/server/profile/repository';
import { renderQr } from '@/server/qr/service';
import { resetEnvCache } from '@/lib/env';

/**
 * The rollback journey, end to end (master spec §84, §85; completion Phase 7).
 *
 * This is the last leg of the final acceptance test: publish, change a price,
 * publish again, roll back, and confirm the visitor sees the earlier price
 * through the *same* QR code. Before snapshots existed this journey could not
 * be run at all, because a version recorded only that a publish had happened.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const SLUG = 'version-fixture';
let businessId = '';
let publicId = '';
let menuId = '';
let user = { id: '', role: 'SUPER_ADMIN' as const };

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: SLUG } });
  await prisma.user.deleteMany({ where: { email: 'versions-fixture@example.test' } });
}

async function priceOf(code: string) {
  const item = await prisma.menuItem.findFirst({
    where: { businessId, itemCode: code },
    select: { priceMinor: true },
  });
  return item?.priceMinor ?? null;
}

async function setPrice(code: string, priceMinor: number) {
  await prisma.menuItem.updateMany({ where: { businessId, itemCode: code }, data: { priceMinor } });
}

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;

  await removeFixture();

  const staff = await prisma.user.create({
    data: { email: 'versions-fixture@example.test', name: 'Version Fixture', role: 'SUPER_ADMIN' },
  });
  user = { id: staff.id, role: 'SUPER_ADMIN' };

  const business = await createBusiness(user, {
    slug: SLUG,
    type: 'RESTAURANT',
    status: 'ACTIVE',
    defaultLocale: 'ar',
    currency: 'SAR',
    nameAr: 'مطعم النسخ',
    nameEn: 'Version Fixture',
  } as Parameters<typeof createBusiness>[1]);

  businessId = business.id;
  publicId = business.publicId;

  const menu = await prisma.menu.create({
    data: { businessId, key: 'main', titleAr: 'القائمة', titleEn: 'Menu', status: 'DRAFT' },
  });
  menuId = menu.id;

  const category = await prisma.menuCategory.create({
    data: { menuId, businessId, key: 'mains', nameAr: 'الأطباق', nameEn: 'Mains', sortOrder: 0 },
  });

  await prisma.menuItem.createMany({
    data: [
      {
        categoryId: category.id,
        businessId,
        itemCode: 'VF-001',
        nameAr: 'برجر',
        nameEn: 'Burger',
        priceMinor: 3800,
        currency: 'SAR',
      },
      {
        categoryId: category.id,
        businessId,
        itemCode: 'VF-002',
        nameAr: 'سلطة',
        nameEn: 'Salad',
        priceMinor: 2200,
        currency: 'SAR',
      },
    ],
  });
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('menu versions', () => {
  it('captures content on publish, so a version has something to restore', async () => {
    const first = await publishMenu(user, businessId, menuId);

    const stored = await prisma.menuVersion.findUniqueOrThrow({
      where: { id: first.id },
      select: { snapshot: true, summary: true, version: true },
    });

    expect(stored.version).toBe(1);
    expect(stored.snapshot).not.toBeNull();

    const snapshot = stored.snapshot as { categories: { items: { itemCode: string }[] }[] };
    const codes = snapshot.categories.flatMap((c) => c.items.map((i) => i.itemCode));
    expect(codes.sort()).toEqual(['VF-001', 'VF-002']);
  });

  it('reports a draft that matches live as having no pending changes', async () => {
    const pending = await getPendingChanges(user, businessId, menuId);
    expect(pending.hasChanges).toBe(false);
  });

  it('shows a price edit as a pending change before it is published', async () => {
    await setPrice('VF-001', 4200);

    const pending = await getPendingChanges(user, businessId, menuId);

    expect(pending.hasChanges).toBe(true);
    expect(pending.diff.priceChanges).toEqual([
      expect.objectContaining({ itemCode: 'VF-001', from: 3800, to: 4200 }),
    ]);
  });

  it('records the change summary on the version it publishes', async () => {
    const second = await publishMenu(user, businessId, menuId);

    const stored = await prisma.menuVersion.findUniqueOrThrow({
      where: { id: second.id },
      select: { summary: true },
    });

    expect(stored.summary).toMatchObject({ pricesChanged: 1, itemsAdded: 0, itemsRemoved: 0 });
  });

  it('restores an earlier version as a new version, keeping history intact', async () => {
    const before = await getMenuVersions(user, businessId, menuId);
    const v1 = before.versions.find((version) => version.version === 1);

    expect(v1?.restorable).toBe(true);

    const result = await restoreMenuVersion(user, businessId, menuId, v1!.id);

    expect(result.restoredFrom).toBe(1);
    expect(result.version.version).toBe(3);

    // The price is back, and nothing was deleted from history.
    expect(await priceOf('VF-001')).toBe(3800);

    const after = await getMenuVersions(user, businessId, menuId);
    expect(after.versions.map((v) => v.version).sort()).toEqual([1, 2, 3]);
    expect(after.versions.find((v) => v.version === 3)?.restoredFromVersion).toBe(1);
  });

  it('serves the restored content to a visitor through the same QR', async () => {
    const qrBefore = await renderQr({ publicId });

    const profile = await getPublicProfile(publicId);
    const items = profile!.menus.flatMap((menu) => menu.categories).flatMap((c) => c.items);
    const burger = items.find((item) => item.code === 'VF-001');

    expect(burger?.priceMinor).toBe(3800);

    const qrAfter = await renderQr({ publicId });
    expect(qrAfter.svg).toBe(qrBefore.svg);
  });

  it('can roll the rollback back, because history is append-only', async () => {
    const history = await getMenuVersions(user, businessId, menuId);
    const v2 = history.versions.find((version) => version.version === 2);

    await restoreMenuVersion(user, businessId, menuId, v2!.id);

    expect(await priceOf('VF-001')).toBe(4200);
  });

  it('refuses a version id belonging to another business', async () => {
    const other = await prisma.business.findFirstOrThrow({
      where: { publicId: 'DEM001' },
      select: { id: true, menus: { select: { currentVersionId: true }, take: 1 } },
    });

    const foreignVersionId = other.menus[0]?.currentVersionId;
    if (!foreignVersionId) return;

    await expect(
      restoreMenuVersion(user, businessId, menuId, foreignVersionId),
    ).rejects.toThrow();
  });

  it('keeps items that changed category rather than recreating them', async () => {
    const drinks = await prisma.menuCategory.create({
      data: { menuId, businessId, key: 'drinks', nameAr: 'المشروبات', nameEn: 'Drinks', sortOrder: 1 },
    });

    await prisma.menuItem.updateMany({
      where: { businessId, itemCode: 'VF-002' },
      data: { categoryId: drinks.id },
    });

    const pending = await getPendingChanges(user, businessId, menuId);

    expect(pending.diff.itemsAdded).toHaveLength(0);
    expect(pending.diff.itemsRemoved).toHaveLength(0);
    expect(pending.diff.categoriesAdded).toEqual(['drinks']);
  });
});
