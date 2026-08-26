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
    // The row exists; it is simply not public (master spec §20 status model).
    const row = await prisma.business.findUnique({ where: { publicId: 'DRAFT1' } });
    expect(row).not.toBeNull();
    expect(await getPublicProfile('DRAFT1')).toBeNull();
  });

  it('serves only menus that are active and carry a published version', async () => {
    const profile = await getPublicProfile('DEM001');
    const keys = profile?.menus.map((menu) => menu.key);

    expect(keys).toContain('main');
    // Seeded but in draft.
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
