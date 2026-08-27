import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/server/db/client';
import { getStorage } from '@/server/storage';
import { recordAudit } from '@/server/audit/log';
import {
  TenantAccessError,
  requireTenantContext,
  tenantScope,
  type AuthenticatedUser,
  type TenantContext,
} from '@/server/tenancy/context';
import { ALLOWED_PUBLIC_TYPES, validateUpload, type UploadCandidate } from './validation';

/**
 * Public file management (master spec §47–§53, §107, §108).
 *
 * The architectural rule this enforces: **a file is never a QR destination**.
 * A QR resolves to the profile; the profile links to the current version of a
 * file. Replacing a PDF adds a version row and repoints a pointer — the
 * public URL and the printed code are untouched (§48, §50).
 *
 * Storage keys are generated, tenant-prefixed and unguessable. They are never
 * derived from the uploaded filename, so a crafted name cannot reach another
 * tenant's namespace or overwrite an existing object.
 */

export interface UploadFileInput {
  key: string;
  titleAr: string;
  titleEn?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  isPublic: boolean;
  allowDownload: boolean;
  sortOrder?: number;
  upload: UploadCandidate;
}

export interface CreateLinkInput {
  key: string;
  titleAr: string;
  titleEn?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  externalUrl: string;
  isPublic: boolean;
  sortOrder?: number;
}

/**
 * Uploads a new file, or a new version of an existing one.
 *
 * Both paths are the same call on purpose: "replace the PDF" is the common
 * operation, and making it a distinct code path is how implementations end up
 * with a replace that forgets to keep history.
 */
export async function uploadPublicFile(
  user: AuthenticatedUser,
  businessId: string,
  input: UploadFileInput,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  // Validate before anything is written: an invalid file must not leave a
  // half-created row or an orphan object behind.
  const validated = validateUpload(input.upload, ALLOWED_PUBLIC_TYPES);

  const storageKey = buildStorageKey(context, input.key, validated.extension);
  const checksum = createHash('sha256').update(input.upload.bytes).digest('hex');

  await getStorage().put({
    key: storageKey,
    body: input.upload.bytes,
    contentType: validated.contentType,
    cacheControl: 'public, max-age=31536000, immutable',
  });

  const file = await prisma.$transaction(async (tx) => {
    const existing = await tx.publicFile.findUnique({
      where: { businessId_key: { businessId: context.businessId, key: input.key } },
      select: { id: true },
    });

    const row = existing
      ? await tx.publicFile.update({
          where: { id: existing.id },
          data: {
            titleAr: input.titleAr,
            titleEn: input.titleEn ?? null,
            descriptionAr: input.descriptionAr ?? null,
            descriptionEn: input.descriptionEn ?? null,
            isPublic: input.isPublic,
            allowDownload: input.allowDownload,
            sortOrder: input.sortOrder ?? 0,
            kind: 'FILE',
          },
        })
      : await tx.publicFile.create({
          data: {
            businessId: context.businessId,
            key: input.key,
            kind: 'FILE',
            titleAr: input.titleAr,
            titleEn: input.titleEn ?? null,
            descriptionAr: input.descriptionAr ?? null,
            descriptionEn: input.descriptionEn ?? null,
            isPublic: input.isPublic,
            allowDownload: input.allowDownload,
            sortOrder: input.sortOrder ?? 0,
          },
        });

    const latest = await tx.publicFileVersion.findFirst({
      where: { fileId: row.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const version = await tx.publicFileVersion.create({
      data: {
        fileId: row.id,
        version: (latest?.version ?? 0) + 1,
        storageKey,
        contentType: validated.contentType,
        sizeBytes: validated.sizeBytes,
        originalName: validated.safeName,
        checksum,
        uploadedById: user.id,
      },
    });

    // Repointing is the last step and is atomic with the version insert: a
    // reader can never see a file whose current version does not exist.
    await tx.publicFile.update({
      where: { id: row.id },
      data: { currentVersionId: version.id },
    });

    return { row, version, replaced: Boolean(existing) };
  });

  await recordAudit({
    action: file.replaced ? 'file.replaced' : 'file.uploaded',
    entity: 'public_file',
    entityId: file.row.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: {
      key: input.key,
      version: file.version.version,
      sizeBytes: validated.sizeBytes,
      contentType: validated.contentType,
    },
  });

  return file.row;
}

export async function createExternalLink(
  user: AuthenticatedUser,
  businessId: string,
  input: CreateLinkInput,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  assertSafeExternalUrl(input.externalUrl);

  const row = await prisma.publicFile.upsert({
    where: { businessId_key: { businessId: context.businessId, key: input.key } },
    update: {
      kind: 'LINK',
      titleAr: input.titleAr,
      titleEn: input.titleEn ?? null,
      descriptionAr: input.descriptionAr ?? null,
      descriptionEn: input.descriptionEn ?? null,
      externalUrl: input.externalUrl,
      isPublic: input.isPublic,
      sortOrder: input.sortOrder ?? 0,
    },
    create: {
      businessId: context.businessId,
      key: input.key,
      kind: 'LINK',
      titleAr: input.titleAr,
      titleEn: input.titleEn ?? null,
      descriptionAr: input.descriptionAr ?? null,
      descriptionEn: input.descriptionEn ?? null,
      externalUrl: input.externalUrl,
      isPublic: input.isPublic,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  await recordAudit({
    action: 'file.uploaded',
    entity: 'public_file',
    entityId: row.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { key: input.key, kind: 'LINK' },
  });

  return row;
}

export async function setFileVisibility(
  user: AuthenticatedUser,
  businessId: string,
  fileId: string,
  isPublic: boolean,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const result = await prisma.publicFile.updateMany({
    where: { id: fileId, ...tenantScope(context) },
    data: { isPublic },
  });

  if (result.count === 0) throw new TenantAccessError('File not found');

  await recordAudit({
    action: 'file.updated',
    entity: 'public_file',
    entityId: fileId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { isPublic },
  });
}

/**
 * Deletes a file and every stored object behind it.
 *
 * Storage is cleaned after the database commit: an orphaned object costs
 * pennies, while a row pointing at a deleted object is a broken download on a
 * customer's profile.
 */
export async function deletePublicFile(
  user: AuthenticatedUser,
  businessId: string,
  fileId: string,
) {
  const context = await requireTenantContext(user, businessId, 'MANAGER');

  const file = await prisma.publicFile.findFirst({
    where: { id: fileId, ...tenantScope(context) },
    select: { id: true, key: true, versions: { select: { storageKey: true } } },
  });

  if (!file) throw new TenantAccessError('File not found');

  await prisma.publicFile.delete({ where: { id: file.id } });

  const storage = getStorage();
  await Promise.all(
    file.versions.map(async (version) => {
      try {
        await storage.delete(version.storageKey);
      } catch (error) {
        console.error('[files] failed to delete stored object', {
          key: version.storageKey,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }),
  );

  await recordAudit({
    action: 'file.deleted',
    entity: 'public_file',
    entityId: fileId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { key: file.key, versions: file.versions.length },
  });
}

export async function listFilesForAdmin(user: AuthenticatedUser, businessId: string) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  return prisma.publicFile.findMany({
    where: tenantScope(context),
    orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    include: {
      currentVersion: true,
      _count: { select: { versions: true } },
    },
  });
}

/**
 * Generates a storage key.
 *
 * Tenant-prefixed so keys are trivially attributable, and suffixed with random
 * bytes so a replacement never overwrites the previous version — history is
 * only meaningful if the old bytes survive.
 */
function buildStorageKey(context: TenantContext, fileKey: string, extension: string): string {
  const nonce = randomBytes(8).toString('hex');
  return `businesses/${context.businessId}/files/${fileKey}-${nonce}${extension}`;
}

/**
 * External menu links are rendered as anchors on a public page, so the scheme
 * is restricted: `javascript:` and `data:` URLs would be script injection with
 * extra steps (master spec §127).
 */
export function assertSafeExternalUrl(value: string): void {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new TenantAccessError('External link must be an absolute URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TenantAccessError('External link must use http or https');
  }
}
