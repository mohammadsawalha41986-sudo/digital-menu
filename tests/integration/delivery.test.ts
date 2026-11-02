import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, publishMenu, ValidationError } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import { getDeliverySettings, saveDeliverySettings } from '@/server/delivery/service';
import { getPublicProfile } from '@/server/profile/repository';
import { resolveDatabase } from '../database';

/**
 * A restaurant's delivery area against the real database: what a manager
 * saves is what the public menu carries, an editor cannot change it, and no
 * restaurant can read or change another's.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'delivery-fixture';
const OTHER_SLUG = 'delivery-other';
const EMAIL = 'delivery-owner@example.test';
const EDITOR_EMAIL = 'delivery-editor@example.test';
const OUTSIDER_EMAIL = 'delivery-outsider@example.test';

const ORIGIN = { lat: 24.7136, lng: 46.6753 };

let owner = { id: '', role: 'SUPER_ADMIN' as const };
let editor = { id: '', role: 'STAFF' as const };
let outsider = { id: '', role: 'STAFF' as const };
let businessId = '';
let publicId = '';
let otherBusinessId = '';

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: { in: [EMAIL, EDITOR_EMAIL, OUTSIDER_EMAIL] } } });
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

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await removeFixture();

  owner = { id: (await prisma.user.create({ data: { email: EMAIL, name: 'Owner', role: 'SUPER_ADMIN' } })).id, role: 'SUPER_ADMIN' };
  const editorRow = await prisma.user.create({ data: { email: EDITOR_EMAIL, name: 'Editor', role: 'STAFF' } });
  editor = { id: editorRow.id, role: 'STAFF' };
  outsider = { id: (await prisma.user.create({ data: { email: OUTSIDER_EMAIL, name: 'Outsider', role: 'STAFF' } })).id, role: 'STAFF' };

  const business = await makeBusiness(SLUG);
  businessId = business.id;
  publicId = business.publicId;
  otherBusinessId = (await makeBusiness(OTHER_SLUG)).id;
  await prisma.businessMembership.create({ data: { userId: editorRow.id, businessId, role: 'EDITOR' } });

  // A published menu, so the public profile is served.
  const menu = await prisma.menu.create({ data: { businessId, key: 'main', titleAr: 'المنيو', titleEn: 'Menu', status: 'ACTIVE' } });
  const category = await prisma.menuCategory.create({
    data: { menuId: menu.id, businessId, key: 'mains', nameAr: 'الأطباق', nameEn: 'Mains', sortOrder: 0 },
  });
  await prisma.menuItem.create({
    data: { categoryId: category.id, businessId, itemCode: 'DLV-1', nameAr: 'طبق', nameEn: 'Dish', priceMinor: 2500, currency: 'SAR', sortOrder: 0 },
  });
  await publishMenu(owner, businessId, menu.id);
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

const run = databaseReachable ? describe : describe.skip;

run('delivery settings', () => {
  it('saves the location and the bands nearest first, and reads them back', async () => {
    await saveDeliverySettings(owner, businessId, {
      origin: ORIGIN,
      zones: [
        { maxKm: 8, feeMinor: 1500 },
        { maxKm: 3, feeMinor: 500 },
      ],
    });

    const settings = await getDeliverySettings(owner, businessId);
    expect(settings.origin).toEqual(ORIGIN);
    expect(settings.zones).toEqual([
      { maxKm: 3, feeMinor: 500 },
      { maxKm: 8, feeMinor: 1500 },
    ]);
    expect(settings.canEdit).toBe(true);

    const audit = await prisma.auditLog.findFirst({ where: { businessId, action: 'delivery.updated' }, orderBy: { createdAt: 'desc' } });
    expect(audit?.metadata).toMatchObject({ zones: 2, limitKm: 8 });
  });

  it('replaces the bands as a whole: a band left out is gone', async () => {
    await saveDeliverySettings(owner, businessId, { origin: ORIGIN, zones: [{ maxKm: 5, feeMinor: 0 }] });
    expect((await getDeliverySettings(owner, businessId)).zones).toEqual([{ maxKm: 5, feeMinor: 0 }]);
  });

  it('reaches the public menu: the location and each band with its fee', async () => {
    await saveDeliverySettings(owner, businessId, { origin: ORIGIN, zones: [{ maxKm: 2.5, feeMinor: 700 }] });
    const profile = await getPublicProfile(publicId);
    expect(profile?.delivery).toEqual({ origin: ORIGIN, zones: [{ maxKm: 2.5, feeMinor: 700 }] });
  });

  it('can be cleared: no location and no bands', async () => {
    await saveDeliverySettings(owner, businessId, { origin: null, zones: [] });
    const settings = await getDeliverySettings(owner, businessId);
    expect(settings.origin).toBeNull();
    expect(settings.zones).toEqual([]);
  });

  it.each([
    ['bands without a location', { origin: null, zones: [{ maxKm: 3, feeMinor: 500 }] }],
    ['two bands ending at the same distance', { origin: ORIGIN, zones: [{ maxKm: 3, feeMinor: 500 }, { maxKm: 3, feeMinor: 900 }] }],
    ['a band past 100 km', { origin: ORIGIN, zones: [{ maxKm: 150, feeMinor: 500 }] }],
    ['a band of no distance', { origin: ORIGIN, zones: [{ maxKm: 0, feeMinor: 500 }] }],
    ['a negative fee', { origin: ORIGIN, zones: [{ maxKm: 3, feeMinor: -1 }] }],
    ['a location that is not on the globe', { origin: { lat: 95, lng: 46 }, zones: [] }],
    ['more than ten bands', { origin: ORIGIN, zones: Array.from({ length: 11 }, (_, index) => ({ maxKm: index + 1, feeMinor: 100 })) }],
  ])('refuses %s, and keeps what was there', async (_label, input) => {
    await saveDeliverySettings(owner, businessId, { origin: ORIGIN, zones: [{ maxKm: 4, feeMinor: 400 }] });
    await expect(saveDeliverySettings(owner, businessId, input)).rejects.toBeInstanceOf(ValidationError);
    expect((await getDeliverySettings(owner, businessId)).zones).toEqual([{ maxKm: 4, feeMinor: 400 }]);
  });

  it('an editor can read it but not change it', async () => {
    const seen = await getDeliverySettings(editor, businessId);
    expect(seen.canEdit).toBe(false);
    await expect(saveDeliverySettings(editor, businessId, { origin: ORIGIN, zones: [] })).rejects.toBeInstanceOf(TenantAccessError);
  });

  it('another restaurant’s user can neither read nor change it', async () => {
    await expect(getDeliverySettings(outsider, businessId)).rejects.toBeInstanceOf(TenantAccessError);
    await expect(saveDeliverySettings(outsider, businessId, { origin: ORIGIN, zones: [] })).rejects.toBeInstanceOf(TenantAccessError);
  });

  it('saving one restaurant leaves another untouched', async () => {
    await saveDeliverySettings(owner, otherBusinessId, { origin: { lat: 21.5, lng: 39.2 }, zones: [{ maxKm: 9, feeMinor: 900 }] });
    await saveDeliverySettings(owner, businessId, { origin: ORIGIN, zones: [{ maxKm: 1, feeMinor: 100 }] });
    expect((await getDeliverySettings(owner, otherBusinessId)).zones).toEqual([{ maxKm: 9, feeMinor: 900 }]);
  });
});
