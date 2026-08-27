import { afterAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getPublicProfile } from '@/server/profile/repository';

/**
 * Integration coverage for the read path a QR scan takes. Requires a migrated,
 * seeded database (`npm run db:migrate && npm run db:seed`).
 *
 * The suite skips rather than fails when no database is reachable, so a
 * contributor running `npm test` on a fresh checkout still gets the unit
 * suite; CI runs it with Postgres up.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('public profile resolution', () => {
  it('resolves an active business by its public identifier', async () => {
    const profile = await getPublicProfile('DEM001');

    expect(profile).not.toBeNull();
    expect(profile?.publicId).toBe('DEM001');
    expect(profile?.nameAr).toBe('مطعم النموذج');
  });

  it('accepts the identifier as a visitor might type it', async () => {
    expect(await getPublicProfile('dem001')).not.toBeNull();
    expect(await getPublicProfile(' dem001 ')).not.toBeNull();
  });

  it('exposes no internal database id to the render layer', async () => {
    const profile = await getPublicProfile('DEM001');
    const serialized = JSON.stringify(profile);

    expect(Object.keys(profile ?? {})).not.toContain('id');
    // Prisma cuids start with `c` and run 25 chars; none may appear anywhere.
    expect(serialized).not.toMatch(/\bc[a-z0-9]{24}\b/);
  });

  it('does not serve a draft business', async () => {
    const row = await prisma.business.findUnique({ where: { publicId: 'DRAFT1' } });
    expect(row).not.toBeNull();
    expect(await getPublicProfile('DRAFT1')).toBeNull();
  });

  it('serves only menus that are active and carry a published version', async () => {
    const profile = await getPublicProfile('DEM001');
    const keys = profile?.menus.map((menu) => menu.key);

    expect(keys).toContain('main');
    expect(keys).not.toContain('seasonal');
    expect(profile?.menus[0]?.publishedVersion).toBe(1);
  });

  it('returns null for a malformed identifier without querying', async () => {
    for (const input of ['18473', '../../etc/passwd', "' OR 1=1 --", '']) {
      expect(await getPublicProfile(input)).toBeNull();
    }
  });

  it('carries brand tokens for a business that has a theme', async () => {
    const profile = await getPublicProfile('DEM001');
    expect(profile?.brand.colorPrimary).toBe('#2B2118');
  });

  it('falls back to neutral brand tokens when no theme exists', async () => {
    const profile = await getPublicProfile('DEM002');
    expect(profile?.brand.colorPrimary).toBe('#1f2421');
  });
});

describe.skipIf(!databaseReachable)('menu content', () => {
  it('loads categories and items in their configured order', async () => {
    const profile = await getPublicProfile('DEM001');
    const menu = profile?.menus.find((entry) => entry.key === 'main');

    expect(menu?.categories.map((category) => category.key)).toEqual([
      'starters',
      'mains',
      'drinks',
    ]);

    const mains = menu?.categories.find((category) => category.key === 'mains');
    expect(mains?.items.map((item) => item.code)).toEqual(['MN-001', 'MN-002', 'MN-003']);
  });

  it('carries prices as minor units and never invents a missing one', async () => {
    const profile = await getPublicProfile('DEM001');
    const items = profile?.menus[0]?.categories.flatMap((category) => category.items) ?? [];

    const burger = items.find((item) => item.code === 'MN-001');
    expect(burger?.priceMinor).toBe(4200);
    expect(burger?.currency).toBe('SAR');

    // An unpriced item stays unpriced.
    const seasonal = items.find((item) => item.code === 'MN-003');
    expect(seasonal?.priceMinor).toBeNull();
  });

  it('carries calories only where the business supplied them', async () => {
    const profile = await getPublicProfile('DEM001');
    const items = profile?.menus[0]?.categories.flatMap((category) => category.items) ?? [];

    expect(items.find((item) => item.code === 'MN-001')?.calories).toBe(680);
    // Water has none, and none is invented (GOALS I9).
    expect(items.find((item) => item.code === 'DR-002')?.calories).toBeNull();
  });

  it('never serves a hidden item', async () => {
    const profile = await getPublicProfile('DEM001');
    const codes =
      profile?.menus[0]?.categories.flatMap((category) =>
        category.items.map((item) => item.code),
      ) ?? [];

    expect(codes).not.toContain('DR-003');
  });

  it('marks an unavailable item rather than dropping it', async () => {
    const profile = await getPublicProfile('DEM001');
    const items = profile?.menus[0]?.categories.flatMap((category) => category.items) ?? [];

    expect(items.find((item) => item.code === 'MN-003')?.isUnavailable).toBe(true);
    expect(items.find((item) => item.code === 'MN-001')?.isUnavailable).toBe(false);
  });
});

describe.skipIf(!databaseReachable)('branch scoping', () => {
  it('applies a branch price override without duplicating the menu', async () => {
    const shared = await getPublicProfile('DEM001');
    const olaya = await getPublicProfile('DEM001', { branchKey: 'olaya' });

    const priceIn = (profile: Awaited<ReturnType<typeof getPublicProfile>>) =>
      profile?.menus[0]?.categories
        .flatMap((category) => category.items)
        .find((item) => item.code === 'MN-001')?.priceMinor;

    expect(priceIn(shared)).toBe(4200);
    expect(priceIn(olaya)).toBe(4600);
    expect(olaya?.activeBranchKey).toBe('olaya');
  });

  it('leaves other branches on the shared price', async () => {
    const malaz = await getPublicProfile('DEM001', { branchKey: 'malaz' });
    const price = malaz?.menus[0]?.categories
      .flatMap((category) => category.items)
      .find((item) => item.code === 'MN-001')?.priceMinor;

    expect(price).toBe(4200);
  });

  it('prefers branch contact details when scoped to a branch', async () => {
    const olaya = await getPublicProfile('DEM001', { branchKey: 'olaya' });
    expect(olaya?.contact.phone).toBe('+966500000001');

    const shared = await getPublicProfile('DEM001');
    expect(shared?.contact.phone).toBe('+966500000000');
  });

  it('falls back to the business view for an unknown branch key', async () => {
    // A renamed branch must not 404 a printed branch QR.
    const profile = await getPublicProfile('DEM001', { branchKey: 'nonexistent' });
    expect(profile).not.toBeNull();
    expect(profile?.activeBranchKey).toBeNull();
  });

  it('cannot be pointed at another tenant’s branch', async () => {
    // `DEM002` has no branches; naming one from another business changes nothing.
    const profile = await getPublicProfile('DEM002', { branchKey: 'olaya' });
    expect(profile?.activeBranchKey).toBeNull();
    expect(profile?.branches).toHaveLength(0);
  });
});

describe.skipIf(!databaseReachable)('public identifier integrity', () => {
  it('the database refuses an id outside the legible alphabet', async () => {
    // I, L, O and U are excluded so a printed code cannot be misread. An id
    // containing one is silently unreachable — the reader normalises it to a
    // different string — so the constraint stops it being stored at all.
    for (const publicId of ['OFR001', 'ILOU12', 'abc123', 'TOOLONG', 'AB12']) {
      await expect(
        prisma.business.create({
          data: { publicId, slug: `bad-${publicId}`, nameAr: 'x' },
        }),
        publicId,
      ).rejects.toThrow();
    }
  });

  it('accepts a generated identifier', async () => {
    const { generatePublicId } = await import('@/lib/public-id');
    const publicId = generatePublicId();

    const created = await prisma.business.create({
      data: { publicId, slug: `ok-${publicId.toLowerCase()}`, nameAr: 'x' },
    });

    expect(created.publicId).toBe(publicId);
    await prisma.business.delete({ where: { id: created.id } });
  });
});
