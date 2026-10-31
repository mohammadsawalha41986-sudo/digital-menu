import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, publishMenu, ValidationError } from '@/server/admin/business-service';
import {
  applyDiscountToMany,
  listDiscountHistory,
  listDiscounts,
  saveDiscount,
  saveOffersSettings,
  setDiscountEnabled,
} from '@/server/admin/discounts';
import { saveOptionGroup } from '@/server/menu-studio/modifiers';
import { getPublicProfile } from '@/server/profile/repository';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import { resolveDatabase } from '../database';

/**
 * Dish discounts end to end on the server: what is saved, what the public
 * menu shows, and what it hides, at the moment it is read.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'discounts-fixture';
const OTHER_SLUG = 'discounts-other';
const EMAIL = 'discounts-fixture@example.test';
const OTHER_EMAIL = 'discounts-other@example.test';

let businessId = '';
let publicId = '';
let user = { id: '', role: 'SUPER_ADMIN' as const };
let outsider = { id: '', role: 'STAFF' as const };

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
}

const PAST = '2020-01-01T10:00';
const FUTURE = '2099-01-01T10:00';

const dish = async (code: string) => {
  const found = await prisma.menuItem.findFirstOrThrow({ where: { businessId, itemCode: code } });
  return found;
};

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await removeFixture();

  const staff = await prisma.user.create({ data: { email: EMAIL, name: 'Discounts', role: 'SUPER_ADMIN' } });
  user = { id: staff.id, role: 'SUPER_ADMIN' };
  const other = await prisma.user.create({ data: { email: OTHER_EMAIL, name: 'Other', role: 'STAFF' } });
  outsider = { id: other.id, role: 'STAFF' };

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
  publicId = business.publicId;

  await prisma.branch.create({ data: { businessId, key: 'north', nameAr: 'الشمال', sortOrder: 0 } });

  const menu = await prisma.menu.create({ data: { businessId, key: 'main', titleAr: 'القائمة', status: 'DRAFT' } });
  const category = await prisma.menuCategory.create({
    data: { menuId: menu.id, businessId, key: 'chicken', nameAr: 'الدجاج', sortOrder: 0 },
  });
  await prisma.menuItem.createMany({
    data: [
      { categoryId: category.id, businessId, itemCode: 'DISC-A', nameAr: 'نصف دجاج', priceMinor: 4500, currency: 'SAR', sortOrder: 0 },
      { categoryId: category.id, businessId, itemCode: 'DISC-B', nameAr: 'ربع دجاج', priceMinor: 2000, currency: 'SAR', sortOrder: 1 },
      { categoryId: category.id, businessId, itemCode: 'DISC-C', nameAr: 'غير متوفر', priceMinor: 1000, currency: 'SAR', sortOrder: 2, availability: 'UNAVAILABLE' },
    ],
  });
  await publishMenu(user, businessId, menu.id);
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

const shown = async (code: string, branchKey?: string) => {
  const profile = await getPublicProfile(publicId, branchKey ? { branchKey } : {});
  return profile?.menus[0]?.categories.flatMap((category) => category.items).find((item) => item.code === code);
};

describe.skipIf(!databaseReachable)('dish discounts', () => {
  it('a live percentage discount: the sale price is charged and the original is kept', async () => {
    await saveDiscount(user, businessId, {
      itemCode: 'DISC-A',
      enabled: true,
      mode: 'PERCENT',
      value: '20',
    });
    const item = await shown('DISC-A');
    expect(item?.priceMinor).toBe(3600);
    expect(item?.discount).toMatchObject({ originalMinor: 4500, percent: 20, savingMinor: 900 });
    // The stored price is untouched: the sale is worked out, not written over it.
    expect((await dish('DISC-A')).priceMinor).toBe(4500);
  });

  it('a discount that is not live yet is not shown and does not change the price', async () => {
    await saveDiscount(user, businessId, { itemCode: 'DISC-B', enabled: true, mode: 'PERCENT', value: '10', startsAt: FUTURE });
    const item = await shown('DISC-B');
    expect(item?.discount).toBeNull();
    expect(item?.priceMinor).toBe(2000);
  });

  it('an expired discount disappears by itself, with no job having run', async () => {
    await saveDiscount(user, businessId, {
      itemCode: 'DISC-B',
      enabled: true,
      mode: 'PERCENT',
      value: '10',
      startsAt: '2020-01-01T10:00',
      endsAt: '2020-01-02T10:00',
    });
    const item = await shown('DISC-B');
    expect(item?.discount).toBeNull();
    expect(item?.priceMinor).toBe(2000);
  });

  it('a window that ends before it starts is refused', async () => {
    await expect(
      saveDiscount(user, businessId, { itemCode: 'DISC-B', enabled: true, mode: 'PERCENT', value: '10', startsAt: PAST, endsAt: PAST }),
    ).rejects.toThrow(/end before it starts/);
  });

  it('a discount switched off is not shown, and keeps its settings for next time', async () => {
    await saveDiscount(user, businessId, { itemCode: 'DISC-A', enabled: true, mode: 'PERCENT', value: '20' });
    await setDiscountEnabled(user, businessId, 'DISC-A', false);
    expect((await shown('DISC-A'))?.discount).toBeNull();
    const stored = await dish('DISC-A');
    expect([stored.discountEnabled, stored.discountMode, stored.discountValue]).toEqual([false, 'PERCENT', 20]);
    await setDiscountEnabled(user, businessId, 'DISC-A', true);
    expect((await shown('DISC-A'))?.discount?.percent).toBe(20);
  });

  it('refuses to switch on a discount that gives no real price', async () => {
    await prisma.menuItem.update({ where: { id: (await dish('DISC-B')).id }, data: { discountEnabled: false, discountMode: null, discountValue: null } });
    await expect(setDiscountEnabled(user, businessId, 'DISC-B', true)).rejects.toThrow(ValidationError);
  });

  it('refuses a discount that is not a real one, with a clear message', async () => {
    const base = { itemCode: 'DISC-A', enabled: true };
    await expect(saveDiscount(user, businessId, { ...base, mode: 'PERCENT', value: '100' })).rejects.toThrow(/1 to 95/);
    await expect(saveDiscount(user, businessId, { ...base, mode: 'PERCENT', value: '0' })).rejects.toThrow(/1 to 95/);
    await expect(saveDiscount(user, businessId, { ...base, mode: 'PRICE', value: '45' })).rejects.toThrow(/below the original/);
    await expect(saveDiscount(user, businessId, { ...base, mode: 'AMOUNT', value: '50' })).rejects.toThrow(/zero or below/);
    await expect(saveDiscount(user, businessId, { ...base, mode: 'AMOUNT', value: 'abc' })).rejects.toThrow(/price/);
    await expect(saveDiscount(user, businessId, { ...base, mode: 'SOMETHING', value: '5' })).rejects.toThrow(/how the discount/);
    await expect(
      saveDiscount(user, businessId, { ...base, mode: 'PERCENT', value: '10', startsAt: '2099-02-01T10:00', endsAt: '2099-01-01T10:00' }),
    ).rejects.toThrow(/end before it starts/);
    await expect(
      saveDiscount(user, businessId, { ...base, mode: 'PERCENT', value: '10', branchKeys: ['nowhere'] }),
    ).rejects.toThrow(/No branch/);
    await expect(
      saveDiscount(user, businessId, { itemCode: 'DISC-C', enabled: true, mode: 'PERCENT', value: '10' }),
    ).resolves.toBeDefined(); // an unavailable dish can still hold a discount; the menu will not show it
  });

  it('a final price is worked out as a percentage for the owner, and stored as the price', async () => {
    await saveDiscount(user, businessId, { itemCode: 'DISC-A', enabled: true, mode: 'PRICE', value: '36' });
    const item = await shown('DISC-A');
    expect(item?.priceMinor).toBe(3600);
    expect(item?.discount?.percent).toBe(20);
  });

  it('applies only in the branches it names', async () => {
    await saveDiscount(user, businessId, { itemCode: 'DISC-A', enabled: true, mode: 'PERCENT', value: '20', branchKeys: ['north'] });
    expect((await shown('DISC-A'))?.discount).toBeNull();
    expect((await shown('DISC-A', 'north'))?.discount?.percent).toBe(20);
    await saveDiscount(user, businessId, { itemCode: 'DISC-A', enabled: true, mode: 'PERCENT', value: '20' });
  });

  it('a dish that is out of stock is not on offer, even with a live discount', async () => {
    await saveDiscount(user, businessId, { itemCode: 'DISC-C', enabled: true, mode: 'PERCENT', value: '10' });
    const item = await shown('DISC-C');
    expect(item?.discount).toBeNull();
    expect(item?.priceMinor).toBe(1000);
  });

  it('takes the discount off paid options too, only when the restaurant turned that on', async () => {
    await saveOptionGroup(user, businessId, {
      nameAr: 'إضافات',
      required: false,
      max: 2,
      options: [{ nameAr: 'جبنة', price: '10', isDefault: false }],
      items: ['DISC-A'],
    });
    await saveDiscount(user, businessId, { itemCode: 'DISC-A', enabled: true, mode: 'PERCENT', value: '20' });
    const priceOf = async () => (await shown('DISC-A'))?.modifiers[0]?.options[0]?.priceDeltaMinor;
    expect(await priceOf()).toBe(1000);
    await saveOffersSettings(user, businessId, { sort: 'PERCENT', includesOptions: true });
    expect(await priceOf()).toBe(800);
    await saveOffersSettings(user, businessId, { sort: 'PERCENT', includesOptions: false });
    expect(await priceOf()).toBe(1000);
  });

  it('a bulk change is all or nothing: one dish that cannot take it saves none', async () => {
    await setDiscountEnabled(user, businessId, 'DISC-B', false).catch(() => undefined);
    await prisma.menuItem.update({ where: { id: (await dish('DISC-B')).id }, data: { discountEnabled: false, discountMode: null, discountValue: null } });
    await expect(
      applyDiscountToMany(user, businessId, ['DISC-B', 'DISC-A'], { enabled: true, mode: 'AMOUNT', value: '30', startsAt: '', endsAt: '', branchKeys: [] }),
    ).rejects.toThrow(/DISC-A|«/);
    expect((await dish('DISC-B')).discountMode).toBeNull();
  });

  it('a bulk change applies to every chosen dish', async () => {
    const count = await applyDiscountToMany(user, businessId, ['DISC-A', 'DISC-B'], {
      enabled: true,
      mode: 'PERCENT',
      value: '15',
      startsAt: '',
      endsAt: '',
      branchKeys: [],
    });
    expect(count).toBe(2);
    expect((await shown('DISC-A'))?.discount?.percent).toBe(15);
    expect((await shown('DISC-B'))?.discount?.percent).toBe(15);
  });

  it('lists every dish with the state it is in right now', async () => {
    const data = await listDiscounts(user, businessId);
    const states = Object.fromEntries(data.rows.map((row) => [row.itemCode, row.state]));
    expect(states['DISC-A']).toBe('live');
    expect(states['DISC-B']).toBe('live');
    expect(states['DISC-C']).toBe('live');
    expect(data.rows.find((row) => row.itemCode === 'DISC-A')?.saleMinor).toBe(3825);
  });

  it('keeps a history of every change', async () => {
    const history = await listDiscountHistory(user, businessId);
    expect(history.length).toBeGreaterThan(5);
    expect(history.every((entry) => ['item.discount_changed', 'offers.settings_changed'].includes(entry.action))).toBe(true);
  });

  it('another restaurant cannot change or read these discounts', async () => {
    await expect(saveDiscount(outsider, businessId, { itemCode: 'DISC-A', enabled: false, mode: '', value: '' })).rejects.toBeInstanceOf(TenantAccessError);
    await expect(listDiscounts(outsider, businessId)).rejects.toBeInstanceOf(TenantAccessError);
  });
});
