import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, setAutoUpsell, setItemUpsell } from '@/server/admin/business-service';
import { storeAutomaticLinks } from '@/server/admin/upsell-links';
import { resetEnvCache } from '@/lib/env';
import { resolveDatabase } from '../database';

/**
 * Automatic links: stored for dishes with no picks, marked as automatic, never
 * over a restaurant's own picks, and cleared by turning the switch off, while
 * a restaurant's own picks stay.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'auto-links-fixture';
const EMAIL = 'auto-links-fixture@example.test';

let businessId = '';
let user = { id: '', role: 'SUPER_ADMIN' as const };

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: SLUG } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function dish(code: string) {
  return prisma.menuItem.findFirstOrThrow({
    where: { businessId, itemCode: code },
    select: { pairsWith: true, pairsAuto: true },
  });
}

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await removeFixture();

  const staff = await prisma.user.create({ data: { email: EMAIL, name: 'Auto links', role: 'SUPER_ADMIN' } });
  user = { id: staff.id, role: 'SUPER_ADMIN' };

  const business = await createBusiness(user, {
    slug: SLUG,
    type: 'RESTAURANT',
    status: 'ACTIVE',
    defaultLocale: 'ar',
    currency: 'SAR',
    nameAr: 'مطعم',
    nameEn: SLUG,
  } as Parameters<typeof createBusiness>[1]);
  businessId = business.id;

  const menu = await prisma.menu.create({ data: { businessId, key: 'main', titleAr: 'القائمة', status: 'DRAFT' } });
  const mains = await prisma.menuCategory.create({
    data: { menuId: menu.id, businessId, key: 'mains', nameAr: 'الأطباق الرئيسية', sortOrder: 0 },
  });
  const drinks = await prisma.menuCategory.create({
    data: { menuId: menu.id, businessId, key: 'drinks', nameAr: 'المشروبات', sortOrder: 1 },
  });
  await prisma.menuItem.createMany({
    data: [
      { categoryId: mains.id, businessId, itemCode: 'AL-MAIN-1', nameAr: 'دجاج', priceMinor: 2500, currency: 'SAR', sortOrder: 0 },
      { categoryId: mains.id, businessId, itemCode: 'AL-MAIN-2', nameAr: 'لحم', priceMinor: 3000, currency: 'SAR', sortOrder: 1, pairsWith: ['AL-DRINK-1'] },
      { categoryId: drinks.id, businessId, itemCode: 'AL-DRINK-1', nameAr: 'عصير', priceMinor: 300, currency: 'SAR', sortOrder: 0 },
      { categoryId: drinks.id, businessId, itemCode: 'AL-DRINK-2', nameAr: 'ماء', priceMinor: 100, currency: 'SAR', sortOrder: 1 },
    ],
  });
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('automatic links', () => {
  it('stores the links for dishes with no picks, marked automatic, and never touches the restaurant’s own picks', async () => {
    await storeAutomaticLinks(
      prisma,
      businessId,
      new Map([
        ['AL-MAIN-1', ['AL-DRINK-1', 'AL-DRINK-2']],
        // A dish with the restaurant's own pick: the link is not written.
        ['AL-MAIN-2', ['AL-DRINK-2']],
      ]),
    );

    expect(await dish('AL-MAIN-1')).toEqual({ pairsWith: ['AL-DRINK-1', 'AL-DRINK-2'], pairsAuto: true });
    expect(await dish('AL-MAIN-2')).toEqual({ pairsWith: ['AL-DRINK-1'], pairsAuto: false });

    const audit = await prisma.auditLog.findFirst({
      where: { businessId, action: 'upsell.auto_linked' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('turning automatic suggestions off clears the automatic links and keeps the restaurant’s own picks', async () => {
    expect(await setAutoUpsell(user, businessId, false)).toBe(true);

    expect(await dish('AL-MAIN-1')).toEqual({ pairsWith: [], pairsAuto: false });
    expect(await dish('AL-MAIN-2')).toEqual({ pairsWith: ['AL-DRINK-1'], pairsAuto: false });

    expect(await setAutoUpsell(user, businessId, true)).toBe(true);
  });

  it('a pick the restaurant saves replaces an automatic link, and survives turning the switch off', async () => {
    await storeAutomaticLinks(prisma, businessId, new Map([['AL-MAIN-1', ['AL-DRINK-1']]]));
    expect((await dish('AL-MAIN-1')).pairsAuto).toBe(true);

    await setItemUpsell(user, businessId, { itemCode: 'AL-MAIN-1', pairsWith: ['AL-DRINK-2'], isNew: false });
    expect(await dish('AL-MAIN-1')).toEqual({ pairsWith: ['AL-DRINK-2'], pairsAuto: false });

    await setAutoUpsell(user, businessId, false);
    expect(await dish('AL-MAIN-1')).toEqual({ pairsWith: ['AL-DRINK-2'], pairsAuto: false });
    await setAutoUpsell(user, businessId, true);
  });
});
