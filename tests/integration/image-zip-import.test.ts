import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { LocalStorageProvider, setStorageForTesting } from '@/server/storage';
import { createZip } from '@/server/qr/zip';
import { parseImageZip } from '@/server/import/image-zip';
import {
  assignPlannedImages,
  describeImageAssignment,
  planImageAssignment,
} from '@/server/import/image-assignment';
import type { AuthenticatedUser } from '@/server/tenancy/context';
import { resolveDatabase } from '../database';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const PUBLIC_ID = 'ZPA001';
const OTHER_PUBLIC_ID = 'ZPA002';
const OWNER_EMAIL = 'zip-owner@example.test';

let businessId = '';
let otherBusinessId = '';
let user: AuthenticatedUser = { id: '', role: 'STAFF' };

/** Real PNG magic bytes, so the media pipeline's content check passes. */
function png(marker: string): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...new TextEncoder().encode(marker.padEnd(16, ' ')),
  ]);
}

async function seedBusiness(publicId: string, slug: string, itemCodes: string[]) {
  const business = await prisma.business.create({
    data: {
      publicId,
      slug,
      type: 'RESTAURANT',
      status: 'ACTIVE',
      nameAr: 'مطعم الصور',
      nameEn: 'Zip Fixture',
    },
  });

  await prisma.menu.create({
    data: {
      businessId: business.id,
      key: 'main',
      status: 'ACTIVE',
      titleAr: 'المنيو',
      categories: {
        create: {
          businessId: business.id,
          key: 'mains',
          nameAr: 'الأطباق',
          items: {
            create: itemCodes.map((itemCode) => ({
              businessId: business.id,
              itemCode,
              nameAr: `طبق ${itemCode}`,
              nameEn: `Dish ${itemCode}`,
              priceMinor: 2500,
            })),
          },
        },
      },
    },
  });

  return business.id;
}

beforeAll(async () => {
  if (!databaseReachable) return;

  const root = await mkdtemp(path.join(tmpdir(), 'dpos-zip-'));
  setStorageForTesting(
    new LocalStorageProvider({ root, publicPrefix: '/uploads', signingSecret: 'test' }),
  );

  await cleanup();

  businessId = await seedBusiness(PUBLIC_ID, 'zip-fixture', ['ZP-001', 'ZP-002']);
  otherBusinessId = await seedBusiness(OTHER_PUBLIC_ID, 'zip-other', ['OTHER-1']);

  const owner = await prisma.user.create({
    data: { email: OWNER_EMAIL, name: 'Zip Owner', role: 'STAFF' },
  });
  user = { id: owner.id, role: 'STAFF' };
  await prisma.businessMembership.create({
    data: { userId: owner.id, businessId, role: 'OWNER' },
  });
});

afterAll(async () => {
  if (databaseReachable) await cleanup();
  setStorageForTesting(undefined);
  await prisma.$disconnect();
});

async function cleanup() {
  await prisma.business.deleteMany({ where: { publicId: { in: [PUBLIC_ID, OTHER_PUBLIC_ID] } } });
  await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
}

describe.skipIf(!databaseReachable)('image ZIP import, end to end', () => {
  it('plans, assigns, and reports what every file in the archive did', async () => {
    const archive = createZip([
      { name: 'ZP-001.png', content: png('one') },
      { name: 'photos/zp-002.png', content: png('two') },
      // Belongs to another business. It must read as unmatched, not reach across.
      { name: 'OTHER-1.png', content: png('other') },
      // Names nothing at all.
      { name: 'GHOST-9.png', content: png('ghost') },
    ]);

    const plan = await planImageAssignment(businessId, parseImageZip(archive));

    expect(plan.matched.map((match) => match.itemCode).sort()).toEqual(['ZP-001', 'ZP-002']);
    expect(plan.unmatched.map((row) => row.itemCode).sort()).toEqual(['GHOST-9', 'OTHER-1']);
    // Nothing has been written yet: preview is read-only.
    expect(await prisma.media.count({ where: { businessId } })).toBe(0);

    const report = await assignPlannedImages(user, businessId, plan);

    expect(report).toMatchObject({ created: 2, replaced: 0, skipped: 2, failed: [] });
    expect(describeImageAssignment(report)).toContain('2 new');

    const items = await prisma.menuItem.findMany({
      where: { businessId },
      select: { itemCode: true, imageMediaId: true },
      orderBy: { itemCode: 'asc' },
    });
    expect(items.every((item) => item.imageMediaId !== null)).toBe(true);

    // The other tenant's item was never touched.
    const other = await prisma.menuItem.findFirstOrThrow({
      where: { businessId: otherBusinessId, itemCode: 'OTHER-1' },
    });
    expect(other.imageMediaId).toBeNull();
    expect(await prisma.media.count({ where: { businessId: otherBusinessId } })).toBe(0);
  });

  it('reports a second run as replacements, not as new photographs', async () => {
    const archive = createZip([{ name: 'ZP-001.png', content: png('replacement') }]);
    const plan = await planImageAssignment(businessId, parseImageZip(archive));

    expect(plan.matched[0]?.hadImage).toBe(true);

    const report = await assignPlannedImages(user, businessId, plan);
    expect(report).toMatchObject({ created: 0, replaced: 1, failed: [] });
  });

  it('leaves an item that the archive does not name exactly as it was', async () => {
    const before = await prisma.menuItem.findFirstOrThrow({
      where: { businessId, itemCode: 'ZP-002' },
      select: { imageMediaId: true },
    });

    const archive = createZip([{ name: 'ZP-001.png', content: png('again') }]);
    const plan = await planImageAssignment(businessId, parseImageZip(archive));
    await assignPlannedImages(user, businessId, plan);

    const after = await prisma.menuItem.findFirstOrThrow({
      where: { businessId, itemCode: 'ZP-002' },
      select: { imageMediaId: true },
    });
    expect(after.imageMediaId).toBe(before.imageMediaId);
  });

  it('refuses a staff member with no grant on the business', async () => {
    const outsider = await prisma.user.create({
      data: { email: 'zip-outsider@example.test', name: 'Outsider', role: 'STAFF' },
    });

    const archive = createZip([{ name: 'ZP-001.png', content: png('intruder') }]);
    const plan = await planImageAssignment(businessId, parseImageZip(archive));
    const report = await assignPlannedImages({ id: outsider.id, role: 'STAFF' }, businessId, plan);

    // Refused at the media service, and reported rather than thrown away.
    expect(report.created).toBe(0);
    expect(report.replaced).toBe(0);
    expect(report.failed).toEqual(['ZP-001.png']);

    await prisma.user.delete({ where: { id: outsider.id } });
  });
});
