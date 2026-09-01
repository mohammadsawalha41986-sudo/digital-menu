import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { LocalStorageProvider, setStorageForTesting } from '@/server/storage';
import { getPublicProfile } from '@/server/profile/repository';
import { renderQr } from '@/server/qr/service';
import { resetEnvCache } from '@/lib/env';
import { TenantAccessError, type AuthenticatedUser } from '@/server/tenancy/context';
import {
  createExternalLink,
  deletePublicFile,
  setFileVisibility,
  uploadPublicFile,
} from '@/server/files/service';
import { FileValidationError } from '@/server/files/validation';
import { resolveDatabase } from '../database';

/**
 * File lifecycle, including the invariant that gives this phase its shape:
 * replacing a PDF must not disturb the QR or the public URL (§48, §50).
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const PUBLIC_ID = 'PDF001';
let businessId = '';
let user: AuthenticatedUser = { id: '', role: 'STAFF' };
let outsider: AuthenticatedUser = { id: '', role: 'STAFF' };

function pdf(marker: string): Uint8Array {
  return new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, // %PDF-
    ...new TextEncoder().encode(marker),
  ]);
}

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();

  if (!databaseReachable) return;

  const root = await mkdtemp(path.join(tmpdir(), 'dpos-files-'));
  setStorageForTesting(
    new LocalStorageProvider({ root, publicPrefix: '/uploads', signingSecret: 'test' }),
  );

  await cleanup();

  const business = await prisma.business.create({
    data: {
      publicId: PUBLIC_ID,
      slug: 'file-fixture',
      type: 'RESTAURANT',
      status: 'ACTIVE',
      nameAr: 'مطعم الملفات',
      nameEn: 'File Fixture',
    },
  });

  businessId = business.id;

  const [staff, other] = await Promise.all([
    prisma.user.create({ data: { email: 'files-owner@example.test', name: 'Owner', role: 'STAFF' } }),
    prisma.user.create({ data: { email: 'files-other@example.test', name: 'Other', role: 'STAFF' } }),
  ]);

  user = { id: staff.id, role: 'STAFF' };
  outsider = { id: other.id, role: 'STAFF' };

  await prisma.businessMembership.create({
    data: { userId: staff.id, businessId, role: 'OWNER' },
  });
});

afterAll(async () => {
  if (databaseReachable) await cleanup();
  setStorageForTesting(undefined);
  await prisma.$disconnect();
});

async function cleanup() {
  await prisma.business.deleteMany({ where: { publicId: PUBLIC_ID } });
  // Scoped to this suite's own users: other suites run in parallel against
  // the same database.
  await prisma.user.deleteMany({
    where: { email: { in: ['files-owner@example.test', 'files-other@example.test'] } },
  });
}

const baseInput = {
  key: 'main-menu',
  titleAr: 'المنيو',
  titleEn: 'Main Menu',
  isPublic: true,
  allowDownload: true,
};

describe.skipIf(!databaseReachable)('publishing a PDF', () => {
  it('stores a version and exposes it on the public profile', async () => {
    await uploadPublicFile(user, businessId, {
      ...baseInput,
      upload: { fileName: 'menu.pdf', declaredContentType: 'application/pdf', bytes: pdf('v1') },
    });

    const profile = await getPublicProfile(PUBLIC_ID);
    const download = profile?.downloads.find((entry) => entry.key === 'main-menu');

    expect(download).toBeDefined();
    expect(download?.kind).toBe('file');
    // The public path is the permanent per-file route, not a storage URL.
    expect(download?.url).toBe(`/f/${PUBLIC_ID}/main-menu`);
    expect(download?.url).not.toContain('businesses/');
  });

  it('keeps the QR and the profile URL unchanged when the PDF is replaced', async () => {
    const qrBefore = await renderQr({ publicId: PUBLIC_ID });
    const before = await getPublicProfile(PUBLIC_ID);
    const urlBefore = before?.downloads.find((entry) => entry.key === 'main-menu')?.url;

    await uploadPublicFile(user, businessId, {
      ...baseInput,
      upload: {
        fileName: 'menu-november.pdf',
        declaredContentType: 'application/pdf',
        bytes: pdf('v2-with-different-content'),
      },
    });

    const qrAfter = await renderQr({ publicId: PUBLIC_ID });
    const after = await getPublicProfile(PUBLIC_ID);
    const urlAfter = after?.downloads.find((entry) => entry.key === 'main-menu')?.url;

    // This is the §48 promise, made executable.
    expect(qrAfter.destination).toBe(qrBefore.destination);
    expect(qrAfter.svg).toBe(qrBefore.svg);
    expect(urlAfter).toBe(urlBefore);
  });

  it('keeps previous versions and serves only the current one', async () => {
    const file = await prisma.publicFile.findFirstOrThrow({
      where: { businessId, key: 'main-menu' },
      include: { versions: { orderBy: { version: 'asc' } }, currentVersion: true },
    });

    expect(file.versions).toHaveLength(2);
    expect(file.currentVersion?.version).toBe(2);
    // Each version keeps its own object: history is only real if the bytes survive.
    expect(new Set(file.versions.map((version) => version.storageKey)).size).toBe(2);
  });

  it('refuses a file whose content does not match its type', async () => {
    await expect(
      uploadPublicFile(user, businessId, {
        ...baseInput,
        key: 'not-a-pdf',
        upload: {
          fileName: 'evil.pdf',
          declaredContentType: 'application/pdf',
          bytes: new TextEncoder().encode('<script>alert(1)</script>'),
        },
      }),
    ).rejects.toBeInstanceOf(FileValidationError);

    // Nothing was recorded for the rejected upload.
    const row = await prisma.publicFile.findFirst({ where: { businessId, key: 'not-a-pdf' } });
    expect(row).toBeNull();
  });
});

describe.skipIf(!databaseReachable)('visibility', () => {
  it('hides an unpublished file from the public profile', async () => {
    const file = await prisma.publicFile.findFirstOrThrow({
      where: { businessId, key: 'main-menu' },
      select: { id: true },
    });

    await setFileVisibility(user, businessId, file.id, false);

    const profile = await getPublicProfile(PUBLIC_ID);
    expect(profile?.downloads.find((entry) => entry.key === 'main-menu')).toBeUndefined();

    await setFileVisibility(user, businessId, file.id, true);
    const restored = await getPublicProfile(PUBLIC_ID);
    expect(restored?.downloads.find((entry) => entry.key === 'main-menu')).toBeDefined();
  });
});

describe.skipIf(!databaseReachable)('external menu links', () => {
  it('publishes a link without hosting anything', async () => {
    await createExternalLink(user, businessId, {
      key: 'existing-menu',
      titleAr: 'المنيو الكامل',
      titleEn: 'Full Menu',
      externalUrl: 'https://example.com/menu',
      isPublic: true,
    });

    const profile = await getPublicProfile(PUBLIC_ID);
    const link = profile?.downloads.find((entry) => entry.key === 'existing-menu');

    expect(link?.kind).toBe('link');
    expect(link?.url).toBe('https://example.com/menu');
  });

  it('refuses a scheme that would be script injection', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>']) {
      await expect(
        createExternalLink(user, businessId, {
          key: 'bad-link',
          titleAr: 'سيئ',
          externalUrl: url,
          isPublic: true,
        }),
      ).rejects.toThrow();
    }
  });
});

describe.skipIf(!databaseReachable)('tenant boundaries', () => {
  it('refuses an upload from a user with no grant', async () => {
    await expect(
      uploadPublicFile(outsider, businessId, {
        ...baseInput,
        key: 'hijacked',
        upload: {
          fileName: 'menu.pdf',
          declaredContentType: 'application/pdf',
          bytes: pdf('x'),
        },
      }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });

  it('refuses deletion from a user with no grant', async () => {
    const file = await prisma.publicFile.findFirstOrThrow({
      where: { businessId, key: 'main-menu' },
      select: { id: true },
    });

    await expect(deletePublicFile(outsider, businessId, file.id)).rejects.toBeInstanceOf(
      TenantAccessError,
    );

    expect(await prisma.publicFile.findUnique({ where: { id: file.id } })).not.toBeNull();
  });
});
