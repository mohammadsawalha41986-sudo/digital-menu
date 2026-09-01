import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getPublicProfile } from '@/server/profile/repository';
import { renderQr } from '@/server/qr/service';
import { resetEnvCache } from '@/lib/env';
import { resolveDatabase } from '../database';

/**
 * THE PERMANENCE REGRESSION TEST.
 *
 * The executable form of the product's central promise (master spec §11,
 * §149–§152; GOALS I1, I2): a printed QR keeps working, and keeps showing
 * current content, no matter what staff change.
 *
 * The test changes every category of thing the spec lists — price, calories,
 * template, layout variant, brand colours, business name, branch details — and
 * asserts the QR payload is byte-identical before and after, while the profile
 * behind it reflects the new content.
 *
 * It builds and tears down its own business rather than mutating the seed, so
 * it can run in parallel with the suites that read seeded data.
 *
 * If this test ever fails, the failure is the product, not the test.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const PUBLIC_ID = 'QRT001';
const BRANCH_KEY = 'fixture-branch';

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();

  if (!databaseReachable) return;

  await removeFixture();

  const business = await prisma.business.create({
    data: {
      publicId: PUBLIC_ID,
      slug: 'qr-permanence-fixture',
      type: 'RESTAURANT',
      status: 'ACTIVE',
      nameAr: 'مطعم الاختبار',
      nameEn: 'Fixture Restaurant',
      templateKey: 'editorial',
      variantKey: 'a',
      brandTheme: { create: { colorPrimary: '#2B2118', colorAccent: '#B8874B' } },
      branches: { create: { key: BRANCH_KEY, nameAr: 'فرع', nameEn: 'Branch' } },
    },
  });

  const menu = await prisma.menu.create({
    data: {
      businessId: business.id,
      key: 'main',
      status: 'ACTIVE',
      titleAr: 'المنيو',
      titleEn: 'Menu',
      categories: {
        create: {
          businessId: business.id,
          key: 'mains',
          nameAr: 'الأطباق',
          nameEn: 'Mains',
          items: {
            create: {
              businessId: business.id,
              itemCode: 'FIX-001',
              nameAr: 'طبق',
              nameEn: 'Dish',
              priceMinor: 4200,
              calories: 680,
            },
          },
        },
      },
    },
  });

  const version = await prisma.menuVersion.create({
    data: { menuId: menu.id, version: 1, publishedAt: new Date() },
  });

  await prisma.menu.update({
    where: { id: menu.id },
    data: { currentVersionId: version.id },
  });
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

async function removeFixture() {
  await prisma.business.deleteMany({ where: { publicId: PUBLIC_ID } });
}

function priceOf(profile: Awaited<ReturnType<typeof getPublicProfile>>) {
  return profile?.menus[0]?.categories
    .flatMap((category) => category.items)
    .find((item) => item.code === 'FIX-001')?.priceMinor;
}

describe.skipIf(!databaseReachable)('the QR survives everything staff can change', () => {
  it('encodes the same destination before and after content, brand and template changes', async () => {
    const before = await renderQr({ publicId: PUBLIC_ID });
    expect(before.destination).toBe(`https://menu.example.com/m/${PUBLIC_ID}`);
    expect(priceOf(await getPublicProfile(PUBLIC_ID))).toBe(4200);

    // Everything the spec says must not disturb the QR (§11, §151).
    await prisma.menuItem.updateMany({
      where: { itemCode: 'FIX-001', business: { publicId: PUBLIC_ID } },
      data: { priceMinor: 5100, calories: 705 },
    });
    await prisma.business.updateMany({
      where: { publicId: PUBLIC_ID },
      data: { templateKey: 'nonexistent-family', variantKey: 'z', nameEn: 'Renamed' },
    });
    await prisma.brandTheme.updateMany({
      where: { business: { publicId: PUBLIC_ID } },
      data: { colorPrimary: '#0A3D62', colorAccent: '#38ADA9' },
    });

    const after = await renderQr({ publicId: PUBLIC_ID });

    // The payload — the only thing printed on a card — is unchanged, down to
    // the rendered pixels.
    expect(after.destination).toBe(before.destination);
    expect(after.svg).toBe(before.svg);

    // And the profile behind it serves the new content.
    const updated = await getPublicProfile(PUBLIC_ID);
    expect(priceOf(updated)).toBe(5100);
    expect(updated?.nameEn).toBe('Renamed');
    expect(updated?.brand.colorPrimary).toBe('#0A3D62');
    expect(updated?.publicId).toBe(PUBLIC_ID);
  });

  it('keeps rendering when the stored template no longer exists', async () => {
    // The previous test left an unknown template key in place on purpose: a
    // visitor who scans must still get a branded page, not an error.
    const profile = await getPublicProfile(PUBLIC_ID);
    expect(profile?.templateKey).toBe('nonexistent-family');

    const { resolveTemplate } = await import('@/templates/registry');
    const resolved = resolveTemplate(profile?.templateKey ?? '', profile?.variantKey ?? '');

    expect(resolved.usedFallback).toBe(true);
    expect(resolved.definition.key).toBe('editorial');
  });

  it('produces a branch destination that is equally stable', async () => {
    const before = await renderQr({ publicId: PUBLIC_ID, branchKey: BRANCH_KEY });

    await prisma.branch.updateMany({
      where: { key: BRANCH_KEY, business: { publicId: PUBLIC_ID } },
      data: { nameEn: 'Branch (renamed)', phone: '+966500009999' },
    });

    const after = await renderQr({ publicId: PUBLIC_ID, branchKey: BRANCH_KEY });
    expect(after.destination).toBe(before.destination);
    expect(after.destination).toBe(`https://menu.example.com/m/${PUBLIC_ID}/b/${BRANCH_KEY}`);
  });

  it('never encodes a file, a locale or a version', async () => {
    const result = await renderQr({ publicId: PUBLIC_ID });

    expect(result.destination).not.toMatch(/\.(pdf|png|jpe?g|svg)$/i);
    expect(result.destination).not.toContain('?');
    expect(result.destination).not.toContain('#');
    expect(result.destination).not.toMatch(/\/(ar|en)\//);
  });
});
