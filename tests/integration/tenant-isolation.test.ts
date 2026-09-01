import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import {
  TenantAccessError,
  type AuthenticatedUser,
} from '@/server/tenancy/context';
import { resolveDatabase } from '../database';
import {
  ValidationError,
  deleteBranch,
  listBusinessesForUser,
  getBusinessForAdmin,
  publishMenu,
  updateBrand,
  updateBusiness,
  updateTemplate,
  upsertItem,
} from '@/server/admin/business-service';

/**
 * CROSS-TENANT ISOLATION — the security property with the worst failure mode.
 *
 * Two real businesses, two real staff users, one membership each. Every write
 * service is then called with the *other* tenant's id, and each must refuse.
 *
 * These run against the database rather than a mock, because the property
 * being tested is what the queries actually match, not what a stub returns.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SUFFIX = 'ISO';

let alphaId = '';
let betaId = '';
let alphaUser: AuthenticatedUser = { id: '', role: 'STAFF' };
let betaUser: AuthenticatedUser = { id: '', role: 'STAFF' };
let superAdmin: AuthenticatedUser = { id: '', role: 'SUPER_ADMIN' };
const alphaCategoryKey = 'iso-mains';
let betaBranchId = '';

beforeAll(async () => {
  if (!databaseReachable) return;
  await cleanup();

  const [alpha, beta] = await Promise.all([
    createTenant('TENAA1', 'iso-alpha'),
    createTenant('TENBB2', 'iso-beta'),
  ]);

  alphaId = alpha.id;
  betaId = beta.id;

  const [userA, userB, root] = await Promise.all([
    prisma.user.create({
      data: { email: `alpha-${SUFFIX}@example.test`, name: 'Alpha Staff', role: 'STAFF' },
    }),
    prisma.user.create({
      data: { email: `beta-${SUFFIX}@example.test`, name: 'Beta Staff', role: 'STAFF' },
    }),
    prisma.user.create({
      data: { email: `root-${SUFFIX}@example.test`, name: 'Root', role: 'SUPER_ADMIN' },
    }),
  ]);

  alphaUser = { id: userA.id, role: 'STAFF' };
  betaUser = { id: userB.id, role: 'STAFF' };
  superAdmin = { id: root.id, role: 'SUPER_ADMIN' };

  await prisma.businessMembership.createMany({
    data: [
      { userId: userA.id, businessId: alphaId, role: 'OWNER' },
      { userId: userB.id, businessId: betaId, role: 'OWNER' },
    ],
  });

  const betaBranch = await prisma.branch.findFirstOrThrow({
    where: { businessId: betaId },
    select: { id: true },
  });
  betaBranchId = betaBranch.id;
});

afterAll(async () => {
  if (databaseReachable) await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  await prisma.business.deleteMany({ where: { publicId: { in: ['TENAA1', 'TENBB2'] } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `-${SUFFIX}@example.test` } } });
}

async function createTenant(publicId: string, slug: string) {
  const business = await prisma.business.create({
    data: {
      publicId,
      slug,
      type: 'RESTAURANT',
      status: 'ACTIVE',
      nameAr: `مطعم ${slug}`,
      nameEn: slug,
      brandTheme: { create: {} },
      branches: { create: { key: `${slug}-branch`, nameAr: 'فرع', nameEn: 'Branch' } },
    },
  });

  const menu = await prisma.menu.create({
    data: {
      businessId: business.id,
      key: 'main',
      status: 'ACTIVE',
      titleAr: 'المنيو',
      categories: {
        create: {
          businessId: business.id,
          key: alphaCategoryKey,
          nameAr: 'الأطباق',
          items: {
            create: {
              businessId: business.id,
              itemCode: 'ISO-1',
              nameAr: 'طبق',
              priceMinor: 1000,
            },
          },
        },
      },
    },
  });

  return { id: business.id, menuId: menu.id };
}

const businessInput = {
  nameAr: 'مخترق',
  nameEn: 'Hijacked',
  slug: 'hijacked',
  type: 'RESTAURANT' as const,
  status: 'ACTIVE' as const,
  defaultLocale: 'ar' as const,
  currency: 'SAR' as const,
  descriptionAr: null,
  descriptionEn: null,
  phone: null,
  whatsapp: null,
  email: null,
  website: null,
  instagram: null,
  tiktok: null,
  facebook: null,
  linkedin: null,
  youtube: null,
  googleMapsUrl: null,
  addressAr: null,
  addressEn: null,
  indexProfile: false,
  showPlatformFooter: false,
};

const brandInput = {
  colorPrimary: '#000000',
  colorSecondary: '#111111',
  colorAccent: '#222222',
  colorBackground: '#FFFFFF',
  colorSurface: '#FFFFFF',
  colorText: '#000000',
  colorMuted: '#666666',
  colorBorder: '#CCCCCC',
  fontHeading: 'system-serif' as const,
  fontBody: 'system-sans' as const,
  radiusScale: 'md' as const,
};

const itemInput = {
  itemCode: 'ISO-HIJACK',
  categoryKey: alphaCategoryKey,
  nameAr: 'صنف',
  nameEn: 'Item',
  descriptionAr: null,
  descriptionEn: null,
  price: '10',
  calories: null,
  servingSizeAr: null,
  servingSizeEn: null,
  ingredientsAr: null,
  ingredientsEn: null,
  allergens: [],
  tags: [],
  availability: 'AVAILABLE' as const,
  isFeatured: false,
  sortOrder: 0,
};

describe.skipIf(!databaseReachable)('a staff user cannot reach another tenant', () => {
  it('cannot read the other business', async () => {
    await expect(getBusinessForAdmin(alphaUser, betaId)).rejects.toBeInstanceOf(TenantAccessError);
    await expect(getBusinessForAdmin(betaUser, alphaId)).rejects.toBeInstanceOf(TenantAccessError);
  });

  it('cannot update the other business, even with a valid-looking id', async () => {
    await expect(updateBusiness(alphaUser, betaId, businessInput)).rejects.toBeInstanceOf(
      TenantAccessError,
    );

    // And the row is untouched.
    const beta = await prisma.business.findUniqueOrThrow({ where: { id: betaId } });
    expect(beta.nameEn).toBe('iso-beta');
  });

  it('cannot rebrand the other business', async () => {
    await expect(updateBrand(alphaUser, betaId, brandInput)).rejects.toBeInstanceOf(
      TenantAccessError,
    );

    const theme = await prisma.brandTheme.findUniqueOrThrow({ where: { businessId: betaId } });
    expect(theme.colorPrimary).not.toBe('#000000');
  });

  it('cannot change the other business’s template', async () => {
    await expect(
      updateTemplate(alphaUser, betaId, { templateKey: 'editorial', variantKey: 'a' }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });

  it('cannot write items into the other business', async () => {
    await expect(upsertItem(alphaUser, betaId, itemInput)).rejects.toBeInstanceOf(
      TenantAccessError,
    );

    const leaked = await prisma.menuItem.findFirst({ where: { itemCode: 'ISO-HIJACK' } });
    expect(leaked).toBeNull();
  });

  it('cannot delete the other business’s branch by id', async () => {
    // The branch id is real and correct — only the tenant grant is missing,
    // which is exactly the attack the scope check exists to stop.
    await expect(deleteBranch(alphaUser, alphaId, betaBranchId)).rejects.toBeInstanceOf(
      TenantAccessError,
    );

    const stillThere = await prisma.branch.findUnique({ where: { id: betaBranchId } });
    expect(stillThere).not.toBeNull();
  });

  it('cannot publish the other business’s menu', async () => {
    const betaMenu = await prisma.menu.findFirstOrThrow({
      where: { businessId: betaId },
      select: { id: true },
    });

    await expect(publishMenu(alphaUser, alphaId, betaMenu.id)).rejects.toBeInstanceOf(
      TenantAccessError,
    );

    const menu = await prisma.menu.findUniqueOrThrow({ where: { id: betaMenu.id } });
    expect(menu.currentVersionId).toBeNull();
  });

  it('sees only its own business in the list', async () => {
    const visible = await listBusinessesForUser(alphaUser);
    const ids = visible.map((business) => business.id);

    expect(ids).toContain(alphaId);
    expect(ids).not.toContain(betaId);
  });
});

describe.skipIf(!databaseReachable)('a staff user can operate its own tenant', () => {
  it('reads, writes and publishes within its grant', async () => {
    const business = await getBusinessForAdmin(alphaUser, alphaId);
    expect(business.publicId).toBe('TENAA1');

    const result = await upsertItem(alphaUser, alphaId, itemInput);
    expect(result.created).toBe(true);

    const menu = await prisma.menu.findFirstOrThrow({
      where: { businessId: alphaId },
      select: { id: true },
    });

    const version = await publishMenu(alphaUser, alphaId, menu.id);
    expect(version.version).toBeGreaterThan(0);
  });

  it('rejects an unknown category rather than creating one silently', async () => {
    await expect(
      upsertItem(alphaUser, alphaId, { ...itemInput, categoryKey: 'no-such-category' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a price it cannot read rather than guessing', async () => {
    await expect(
      upsertItem(alphaUser, alphaId, { ...itemInput, itemCode: 'ISO-2', price: 'about ten' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe.skipIf(!databaseReachable)('platform super admin', () => {
  it('reaches every business without a membership row', async () => {
    const alpha = await getBusinessForAdmin(superAdmin, alphaId);
    const beta = await getBusinessForAdmin(superAdmin, betaId);

    expect(alpha.publicId).toBe('TENAA1');
    expect(beta.publicId).toBe('TENBB2');
  });

  it('still cannot reach a business that does not exist', async () => {
    await expect(getBusinessForAdmin(superAdmin, 'cnonexistentnonexistent01')).rejects.toBeInstanceOf(
      TenantAccessError,
    );
  });
});

/**
 * The surfaces added after the original isolation suite was written.
 *
 * Every one of these is a place where a business id, an item code, a version
 * id or a search term arrives from a form or a URL. Each is therefore a place
 * where a missing guard turns into one client reading another's data, so each
 * gets the same test as the original surfaces: try it from the wrong tenant,
 * and require a refusal rather than an empty result that happens to look safe.
 */
describe.skipIf(!databaseReachable)('the newer surfaces respect the same boundary', () => {
  it('cannot read the other business’s profile health', async () => {
    const { getProfileHealth } = await import('@/server/quality/service');

    await expect(getProfileHealth(alphaUser, betaId)).rejects.toThrow();
  });

  it('cannot read the other business’s nutrition readiness', async () => {
    const { getNutritionReadiness } = await import('@/server/nutrition/service');

    await expect(getNutritionReadiness(alphaUser, betaId)).rejects.toThrow();
  });

  it('cannot read the other business’s price history or audit log', async () => {
    const { getAuditLog, getPriceHistory } = await import('@/server/history/service');

    await expect(getPriceHistory(alphaUser, betaId)).rejects.toThrow();
    await expect(getAuditLog(alphaUser, betaId)).rejects.toThrow();
  });

  it('cannot set opening hours on the other business', async () => {
    const { updateWorkingHours } = await import('@/server/admin/business-service');

    await expect(
      updateWorkingHours(alphaUser, betaId, { kind: 'business' }, null),
    ).rejects.toThrow();
  });

  it('cannot issue a preview link for the other business', async () => {
    const { createPreviewLink, listPreviewLinks } = await import('@/server/review/service');

    await expect(createPreviewLink(alphaUser, betaId, {})).rejects.toThrow();
    await expect(listPreviewLinks(alphaUser, betaId)).rejects.toThrow();
  });

  it('cannot read the other business’s change requests', async () => {
    const { listChangeRequests } = await import('@/server/review/service');

    await expect(listChangeRequests(alphaUser, betaId)).rejects.toThrow();
  });

  it('cannot restore a version of the other business’s menu', async () => {
    const { getMenuVersions, restoreMenuVersion } = await import(
      '@/server/admin/business-service'
    );

    await expect(getMenuVersions(alphaUser, betaId, 'any-menu-id')).rejects.toThrow();
    await expect(
      restoreMenuVersion(alphaUser, betaId, 'any-menu-id', 'any-version-id'),
    ).rejects.toThrow();
  });

  it('cannot change a focal point on the other business’s media', async () => {
    const { setAltText, setFocalPoint } = await import('@/server/media/service');

    await expect(
      setFocalPoint(alphaUser, betaId, 'any-media-id', { x: 0.5, y: 0.5 }),
    ).rejects.toThrow();
    await expect(
      setAltText(alphaUser, betaId, 'any-media-id', { ar: 'x', en: 'x' }),
    ).rejects.toThrow();
  });

  it('search never returns another tenant’s content', async () => {
    const { globalSearch } = await import('@/server/admin/search');

    // Search for something that exists only in Beta.
    const beta = await prisma.business.findUniqueOrThrow({
      where: { id: betaId },
      select: { nameAr: true, publicId: true },
    });

    for (const term of [beta.nameAr, beta.publicId]) {
      const { hits } = await globalSearch(alphaUser, term);

      for (const hit of hits) {
        expect(hit.href).not.toContain(betaId);
      }
    }
  });

  it('a staff user cannot manage staff at all', async () => {
    const { createStaffUser, listStaff } = await import('@/server/admin/user-service');

    await expect(listStaff(alphaUser)).rejects.toThrow();
    await expect(
      createStaffUser(alphaUser, { email: 'nope@example.test', name: 'No', role: 'STAFF' }),
    ).rejects.toThrow();
  });

  it('the attention dashboard shows only the businesses the user may see', async () => {
    const { getAttention } = await import('@/server/quality/attention');

    const attention = await getAttention(alphaUser);

    for (const item of attention) {
      for (const business of item.businesses) {
        expect(business.id).not.toBe(betaId);
      }
    }
  });
});
