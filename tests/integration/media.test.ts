import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { LocalStorageProvider, setStorageForTesting } from '@/server/storage';
import {
  addMediaByUrl,
  assignMedia,
  deleteMedia,
  listMedia,
  uploadMedia,
} from '@/server/media/service';
import { getPublicProfile } from '@/server/profile/repository';
import { FileValidationError } from '@/server/files/validation';
import { TenantAccessError, type AuthenticatedUser } from '@/server/tenancy/context';
import { resolveDatabase } from '../database';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const PUBLIC_ID = 'MED001';
let businessId = '';
let user: AuthenticatedUser = { id: '', role: 'STAFF' };
let outsider: AuthenticatedUser = { id: '', role: 'STAFF' };

const OWNER_EMAIL = 'media-owner@example.test';
const OTHER_EMAIL = 'media-other@example.test';

/** A one-pixel PNG: real magic bytes, so it passes content validation. */
function png(marker = ''): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...new TextEncoder().encode(marker.padEnd(16, ' ')),
  ]);
}

beforeAll(async () => {
  if (!databaseReachable) return;

  const root = await mkdtemp(path.join(tmpdir(), 'dpos-media-'));
  setStorageForTesting(
    new LocalStorageProvider({ root, publicPrefix: '/uploads', signingSecret: 'test' }),
  );

  await cleanup();

  const business = await prisma.business.create({
    data: {
      publicId: PUBLIC_ID,
      slug: 'media-fixture',
      type: 'RESTAURANT',
      status: 'ACTIVE',
      nameAr: 'مطعم الصور',
      nameEn: 'Media Fixture',
    },
  });

  businessId = business.id;

  const menu = await prisma.menu.create({
    data: {
      businessId,
      key: 'main',
      status: 'ACTIVE',
      titleAr: 'المنيو',
      categories: {
        create: {
          businessId,
          key: 'mains',
          nameAr: 'الأطباق',
          items: {
            create: { businessId, itemCode: 'MD-001', nameAr: 'طبق', priceMinor: 1000 },
          },
        },
      },
    },
  });

  const version = await prisma.menuVersion.create({
    data: { menuId: menu.id, version: 1, publishedAt: new Date() },
  });
  await prisma.menu.update({ where: { id: menu.id }, data: { currentVersionId: version.id } });

  const [owner, other] = await Promise.all([
    prisma.user.create({ data: { email: OWNER_EMAIL, name: 'Owner', role: 'STAFF' } }),
    prisma.user.create({ data: { email: OTHER_EMAIL, name: 'Other', role: 'STAFF' } }),
  ]);

  user = { id: owner.id, role: 'STAFF' };
  outsider = { id: other.id, role: 'STAFF' };

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
  await prisma.business.deleteMany({ where: { publicId: PUBLIC_ID } });
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
}

const upload = {
  fileName: 'dish.png',
  declaredContentType: 'image/png',
  bytes: png('dish'),
};

describe.skipIf(!databaseReachable)('media upload', () => {
  it('stores an image and returns a row', async () => {
    const media = await uploadMedia(user, businessId, {
      kind: 'ITEM_IMAGE',
      altAr: 'صورة الطبق',
      altEn: 'The dish',
      upload,
    });

    expect(media.contentType).toBe('image/png');
    expect(media.altAr).toBe('صورة الطبق');
    // The key is generated, not derived from the filename.
    expect(media.storageKey).not.toContain('dish.png');
    // Namespaced by the *public* id. The key is rendered into every public
    // profile as part of the image URL, so the internal database id must not
    // appear in it — `tests/integration/public-profile.test.ts` asserts the
    // same invariant from the other end, on the serialised read model.
    expect(media.storageKey).toContain(`businesses/${PUBLIC_ID}/media/`);
    expect(media.storageKey).not.toContain(businessId);
  });

  it('reuses an identical upload rather than storing it twice', async () => {
    const first = await prisma.media.count({ where: { businessId } });
    const media = await uploadMedia(user, businessId, { kind: 'ITEM_IMAGE', upload });
    const second = await prisma.media.count({ where: { businessId } });

    expect(second).toBe(first);
    expect(media.checksum).not.toBeNull();
  });

  it('refuses a file that is not the image type it claims', async () => {
    await expect(
      uploadMedia(user, businessId, {
        kind: 'ITEM_IMAGE',
        upload: {
          fileName: 'evil.png',
          declaredContentType: 'image/png',
          bytes: new TextEncoder().encode('<svg onload=alert(1)>'),
        },
      }),
    ).rejects.toBeInstanceOf(FileValidationError);
  });

  it('refuses SVG, which is executable markup', async () => {
    await expect(
      uploadMedia(user, businessId, {
        kind: 'ITEM_IMAGE',
        upload: {
          fileName: 'logo.svg',
          declaredContentType: 'image/svg+xml',
          bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        },
      }),
    ).rejects.toBeInstanceOf(FileValidationError);
  });

  it('refuses an upload from a user with no grant', async () => {
    await expect(
      uploadMedia(outsider, businessId, { kind: 'ITEM_IMAGE', upload }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});

describe.skipIf(!databaseReachable)('assignment', () => {
  it('puts an image on an item and it reaches the public profile', async () => {
    const media = await uploadMedia(user, businessId, {
      kind: 'ITEM_IMAGE',
      altEn: 'Plate',
      upload: { ...upload, bytes: png('assign') },
    });

    await assignMedia(user, businessId, media.id, { type: 'item', itemCode: 'MD-001' });

    const profile = await getPublicProfile(PUBLIC_ID);
    const item = profile?.menus[0]?.categories
      .flatMap((category) => category.items)
      .find((entry) => entry.code === 'MD-001');

    expect(item?.image?.url).toContain('/uploads/');
    expect(item?.image?.altEn).toBe('Plate');
    // The storage key never reaches the browser as an identifier.
    expect(JSON.stringify(item?.image)).not.toContain('checksum');
  });

  it('clears an assignment', async () => {
    await assignMedia(user, businessId, null, { type: 'item', itemCode: 'MD-001' });

    const profile = await getPublicProfile(PUBLIC_ID);
    const item = profile?.menus[0]?.categories
      .flatMap((category) => category.items)
      .find((entry) => entry.code === 'MD-001');

    expect(item?.image).toBeNull();
  });

  it('refuses to assign another tenant’s media', async () => {
    const other = await prisma.business.create({
      data: { publicId: 'MED002', slug: 'media-other', nameAr: 'آخر' },
    });

    const foreign = await prisma.media.create({
      data: {
        businessId: other.id,
        kind: 'ITEM_IMAGE',
        storageKey: `businesses/${other.id}/media/foreign.png`,
        contentType: 'image/png',
        sizeBytes: 10,
      },
    });

    // The media id is real — only the ownership is wrong, which is exactly
    // the case a naive implementation would let through.
    await expect(
      assignMedia(user, businessId, foreign.id, { type: 'item', itemCode: 'MD-001' }),
    ).rejects.toBeInstanceOf(TenantAccessError);

    await prisma.business.delete({ where: { id: other.id } });
  });

  it('refuses to assign to an item in another tenant', async () => {
    const media = await prisma.media.findFirstOrThrow({ where: { businessId } });

    await expect(
      assignMedia(user, businessId, media.id, { type: 'item', itemCode: 'NOT-MINE' }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});

describe.skipIf(!databaseReachable)('deletion', () => {
  it('clears every reference so nothing points at a missing image', async () => {
    const media = await uploadMedia(user, businessId, {
      kind: 'ITEM_IMAGE',
      upload: { ...upload, bytes: png('delete') },
    });

    await assignMedia(user, businessId, media.id, { type: 'item', itemCode: 'MD-001' });
    await assignMedia(user, businessId, media.id, { type: 'business-logo' });

    await deleteMedia(user, businessId, media.id);

    const item = await prisma.menuItem.findFirstOrThrow({
      where: { businessId, itemCode: 'MD-001' },
    });
    const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });

    // A broken image on a customer's menu is worse than a missing one (§120).
    expect(item.imageMediaId).toBeNull();
    expect(business.logoMediaId).toBeNull();
    expect(await prisma.media.findUnique({ where: { id: media.id } })).toBeNull();
  });

  it('lists what remains', async () => {
    const media = await listMedia(user, businessId);
    expect(media.length).toBeGreaterThan(0);
    expect(media[0]?.url).toContain('/uploads/');
  });
});

describe.skipIf(!databaseReachable)('images added by URL', () => {
  const URL_A = 'https://cdn.example.test/dishes/hummus.jpg';

  it('stores the address and renders it unchanged', async () => {
    const { media } = await addMediaByUrl(user, businessId, {
      url: URL_A,
      kind: 'ITEM_IMAGE',
      altEn: 'Hummus',
      width: 900,
      height: 900,
    });

    expect(media.sourceUrl).toBe(URL_A);
    // Nothing was stored, so nothing may claim to have been.
    expect(media.sizeBytes).toBe(0);
    expect(media.derivativeWidths).toEqual([]);

    const listed = (await listMedia(user, businessId)).find((m) => m.id === media.id);
    // The library shows the external address, not a storage path that 404s.
    expect(listed?.url).toBe(URL_A);
  });

  it('reaches the public profile, and carries no fabricated srcset', async () => {
    const { media } = await addMediaByUrl(user, businessId, {
      url: 'https://cdn.example.test/dishes/fattoush.jpg',
      kind: 'ITEM_IMAGE',
      altEn: 'Fattoush',
      width: 800,
      height: 600,
    });

    await assignMedia(user, businessId, media.id, { type: 'item', itemCode: 'MD-001' });

    const profile = await getPublicProfile(PUBLIC_ID);
    const item = profile?.menus
      .flatMap((menu) => menu.categories)
      .flatMap((category) => category.items)
      .find((entry) => entry.code === 'MD-001');

    expect(item?.image?.url).toBe('https://cdn.example.test/dishes/fattoush.jpg');
    // No bytes were resized, so promising widths that do not exist would
    // hand the browser a set of 404s to choose between.
    expect(item?.image?.srcSet ?? null).toBeNull();
  });

  it('adding the same URL twice updates rather than duplicates', async () => {
    const first = await addMediaByUrl(user, businessId, { url: URL_A, kind: 'ITEM_IMAGE' });
    const again = await addMediaByUrl(user, businessId, {
      url: URL_A,
      kind: 'GALLERY',
      altEn: 'Reused',
    });

    expect(again.deduplicated).toBe(true);
    expect(again.media.id).toBe(first.media.id);
    expect(again.media.kind).toBe('GALLERY');

    const rows = await prisma.media.findMany({ where: { businessId, sourceUrl: URL_A } });
    expect(rows).toHaveLength(1);
  });

  it('refuses a scheme that could execute, before it reaches the database', async () => {
    for (const hostile of ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=']) {
      await expect(
        addMediaByUrl(user, businessId, { url: hostile, kind: 'ITEM_IMAGE' }),
        hostile,
      ).rejects.toThrow(FileValidationError);
    }

    expect(await prisma.media.count({ where: { businessId, sourceUrl: { contains: 'javascript' } } })).toBe(0);
  });

  it('refuses another tenant, like every other media write', async () => {
    await expect(
      addMediaByUrl(outsider, businessId, { url: 'https://cdn.example.test/x.jpg', kind: 'LOGO' }),
    ).rejects.toThrow(TenantAccessError);
  });

  it('deletes cleanly, clearing the reference it was assigned to', async () => {
    const { media } = await addMediaByUrl(user, businessId, {
      url: 'https://cdn.example.test/dishes/to-remove.jpg',
      kind: 'ITEM_IMAGE',
    });
    await assignMedia(user, businessId, media.id, { type: 'item', itemCode: 'MD-001' });

    await deleteMedia(user, businessId, media.id);

    const item = await prisma.menuItem.findFirstOrThrow({ where: { businessId, itemCode: 'MD-001' } });
    expect(item.imageMediaId).toBeNull();
    expect(await prisma.media.findUnique({ where: { id: media.id } })).toBeNull();
  });
});
