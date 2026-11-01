import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness, publishMenu, ValidationError } from '@/server/admin/business-service';
import { createStaffLink, listStaffLinks, resolveStaffToken, revokeStaffLink } from '@/server/staff/service';
import { loadStaffMenu, setStaffAvailability } from '@/server/staff/availability';
import { getPublicProfile } from '@/server/profile/repository';
import { resetEnvCache } from '@/lib/env';
import { resolveDatabase } from '../database';

/**
 * A staff link changes one thing, availability, for one restaurant, and only
 * while it is valid. Each guard below is a way a link could do more than that.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'staff-links-fixture';
const OTHER_SLUG = 'staff-links-other';
const EMAIL = 'staff-links@example.test';

let user = { id: '', role: 'SUPER_ADMIN' as const };
let businessId = '';
let publicId = '';
let otherBusinessId = '';
let token = '';
let linkId = '';

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function makeBusiness(slug: string) {
  return createBusiness(user, {
    slug,
    type: 'RESTAURANT',
    status: 'ACTIVE',
    defaultLocale: 'ar',
    currency: 'SAR',
    nameAr: 'مطعم',
    nameEn: slug,
  } as Parameters<typeof createBusiness>[1]);
}

async function dishState(itemCode: string, inBusiness: string) {
  const item = await prisma.menuItem.findUnique({
    where: { businessId_itemCode: { businessId: inBusiness, itemCode } },
    select: { availability: true },
  });
  return item?.availability ?? null;
}

/** The dish codes the public profile shows, across every menu. */
async function publicCodes(): Promise<string[]> {
  const profile = await getPublicProfile(publicId);
  return (profile?.menus ?? []).flatMap((menu) =>
    menu.categories.flatMap((category) => category.items.map((item) => item.code)),
  );
}

const run = databaseReachable ? describe : describe.skip;

run('staff links', () => {
  beforeAll(async () => {
    process.env.PUBLIC_URL = 'https://menu.example.com';
    resetEnvCache();
    await removeFixture();

    const staff = await prisma.user.create({ data: { email: EMAIL, name: 'Staff links', role: 'SUPER_ADMIN' } });
    user = { id: staff.id, role: 'SUPER_ADMIN' };

    const business = await makeBusiness(SLUG);
    businessId = business.id;
    publicId = business.publicId;
    const menu = await prisma.menu.create({ data: { businessId, key: 'main', titleAr: 'القائمة', status: 'DRAFT' } });
    const category = await prisma.menuCategory.create({
      data: { menuId: menu.id, businessId, key: 'mains', nameAr: 'الأطباق', sortOrder: 0 },
    });
    await prisma.menuItem.createMany({
      data: [
        { categoryId: category.id, businessId, itemCode: 'SL-001', nameAr: 'دجاج', priceMinor: 2500, currency: 'SAR', sortOrder: 0 },
        { categoryId: category.id, businessId, itemCode: 'SL-002', nameAr: 'موسمي', priceMinor: 3000, currency: 'SAR', sortOrder: 1, availability: 'SEASONAL' },
      ],
    });
    await publishMenu(user, businessId, menu.id);

    const other = await makeBusiness(OTHER_SLUG);
    otherBusinessId = other.id;
    const otherMenu = await prisma.menu.create({ data: { businessId: otherBusinessId, key: 'main', titleAr: 'قائمة أخرى', status: 'DRAFT' } });
    const otherCategory = await prisma.menuCategory.create({
      data: { menuId: otherMenu.id, businessId: otherBusinessId, key: 'mains', nameAr: 'أطباق', sortOrder: 0 },
    });
    await prisma.menuItem.create({
      data: { categoryId: otherCategory.id, businessId: otherBusinessId, itemCode: 'SL-B-001', nameAr: 'طبق', priceMinor: 1000, currency: 'SAR', sortOrder: 0 },
    });
  });

  afterAll(async () => {
    await removeFixture();
    await prisma.$disconnect();
  });

  it('issues a link whose token opens exactly its own restaurant', async () => {
    const issued = await createStaffLink(user, businessId, { label: 'Front desk', days: 30 });
    token = issued.token;
    linkId = issued.link.id;

    const resolved = await resolveStaffToken(token);
    expect(resolved?.businessId).toBe(businessId);
    expect(resolved?.label).toBe('Front desk');
  });

  it('refuses a token with the wrong secret, or an unknown key', async () => {
    const [key = '', secret = ''] = token.split('.');
    const flipped = secret.slice(0, -1) + (secret.endsWith('a') ? 'b' : 'a');
    expect(await resolveStaffToken(`${key}.${flipped}`)).toBeNull();
    expect(await resolveStaffToken('zzzzzzzzzzzz.zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBeNull();
    expect(await resolveStaffToken('not-a-token')).toBeNull();
  });

  it('lists the link as usable', async () => {
    const links = await listStaffLinks(user, businessId);
    expect(links.find((link) => link.id === linkId)?.isUsable).toBe(true);
  });

  it('changes a dish of its own restaurant, and the public menu follows', async () => {
    await setStaffAvailability(token, 'SL-001', 'UNAVAILABLE');
    expect(await dishState('SL-001', businessId)).toBe('UNAVAILABLE');
    expect(await publicCodes()).toContain('SL-001');

    await setStaffAvailability(token, 'SL-001', 'HIDDEN');
    expect(await dishState('SL-001', businessId)).toBe('HIDDEN');
    expect(await publicCodes()).not.toContain('SL-001');

    // Hidden dishes are still listed for staff, so they can put one back.
    const menu = await loadStaffMenu(token);
    const dish = menu?.sections.flatMap((section) => section.items).find((item) => item.itemCode === 'SL-001');
    expect(dish?.availability).toBe('HIDDEN');

    await setStaffAvailability(token, 'SL-001', 'AVAILABLE');
    expect(await dishState('SL-001', businessId)).toBe('AVAILABLE');
    expect(await publicCodes()).toContain('SL-001');
  });

  it("refuses another restaurant's dish, and leaves it as it was", async () => {
    await expect(setStaffAvailability(token, 'SL-B-001', 'HIDDEN')).rejects.toBeInstanceOf(ValidationError);
    expect(await dishState('SL-B-001', otherBusinessId)).toBe('AVAILABLE');
  });

  it('refuses a seasonal dish: that is the owner’s decision', async () => {
    await expect(setStaffAvailability(token, 'SL-002', 'AVAILABLE')).rejects.toBeInstanceOf(ValidationError);
    expect(await dishState('SL-002', businessId)).toBe('SEASONAL');
  });

  it('accepts only the three staff states, whatever is posted', async () => {
    await expect(setStaffAvailability(token, 'SL-001', 'SEASONAL')).rejects.toBeInstanceOf(ValidationError);
    await expect(setStaffAvailability(token, 'SL-001', 'DELETE')).rejects.toBeInstanceOf(ValidationError);
    await expect(setStaffAvailability(token, '', 'AVAILABLE')).rejects.toBeInstanceOf(ValidationError);
    expect(await dishState('SL-001', businessId)).toBe('AVAILABLE');
  });

  it('stops working the moment it is revoked, even on a page already open', async () => {
    await revokeStaffLink(user, businessId, linkId);

    expect(await resolveStaffToken(token)).toBeNull();
    expect(await loadStaffMenu(token)).toBeNull();
    await expect(setStaffAvailability(token, 'SL-001', 'UNAVAILABLE')).rejects.toBeInstanceOf(ValidationError);
    expect(await dishState('SL-001', businessId)).toBe('AVAILABLE');

    const links = await listStaffLinks(user, businessId);
    expect(links.find((link) => link.id === linkId)?.isUsable).toBe(false);
  });

  it('stops working when it expires', async () => {
    const issued = await createStaffLink(user, businessId, { label: 'Kitchen', days: 1 });
    expect(await resolveStaffToken(issued.token)).not.toBeNull();

    await prisma.staffLink.update({ where: { id: issued.link.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveStaffToken(issued.token)).toBeNull();
  });

  it('will not issue a link with no name', async () => {
    await expect(createStaffLink(user, businessId, { label: '   ' })).rejects.toBeInstanceOf(ValidationError);
  });
});
