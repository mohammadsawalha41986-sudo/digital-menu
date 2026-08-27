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
import {
  ALLOWED_IMAGE_TYPES,
  validateUpload,
  type UploadCandidate,
} from '@/server/files/validation';

/**
 * Media library (master spec §87, §88).
 *
 * Images go through the same three-way validation as documents — declared
 * type, extension and magic bytes must agree — and the same generated,
 * tenant-prefixed, nonce-suffixed storage keys, so a crafted filename can
 * neither escape a tenant's namespace nor overwrite an existing object.
 *
 * Assignment is separate from upload on purpose: one uploaded image can be an
 * item photo, a category cover and an OG image at once, and re-uploading it
 * three times would be both wasteful and a source of drift.
 */

export type MediaKind =
  | 'LOGO'
  | 'ITEM_IMAGE'
  | 'CATEGORY_IMAGE'
  | 'OFFER_IMAGE'
  | 'GALLERY'
  | 'OG_IMAGE';

export interface UploadMediaInput {
  kind: MediaKind;
  altAr?: string | null;
  altEn?: string | null;
  upload: UploadCandidate;
  /** Intrinsic dimensions, read client-side; used to prevent layout shift. */
  width?: number | null;
  height?: number | null;
}

export async function uploadMedia(
  user: AuthenticatedUser,
  businessId: string,
  input: UploadMediaInput,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const validated = validateUpload(input.upload, ALLOWED_IMAGE_TYPES);
  const storageKey = buildMediaKey(context, validated.extension);
  const checksum = createHash('sha256').update(input.upload.bytes).digest('hex');

  // Identical bytes already uploaded for this tenant: reuse rather than store
  // a second copy. Menus repeat images far more often than they don't.
  const existing = await prisma.media.findFirst({
    where: { businessId: context.businessId, checksum },
  });

  if (existing) return existing;

  await getStorage().put({
    key: storageKey,
    body: input.upload.bytes,
    contentType: validated.contentType,
    cacheControl: 'public, max-age=31536000, immutable',
  });

  const media = await prisma.media.create({
    data: {
      businessId: context.businessId,
      kind: input.kind,
      storageKey,
      contentType: validated.contentType,
      sizeBytes: validated.sizeBytes,
      width: input.width ?? null,
      height: input.height ?? null,
      // Alt text is authored, never generated from a filename.
      altAr: input.altAr ?? null,
      altEn: input.altEn ?? null,
      originalName: validated.safeName,
      checksum,
    },
  });

  await recordAudit({
    action: 'file.uploaded',
    entity: 'media',
    entityId: media.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { kind: input.kind, sizeBytes: validated.sizeBytes },
  });

  return media;
}

export type AssignTarget =
  | { type: 'business-logo' }
  | { type: 'business-og' }
  | { type: 'item'; itemCode: string }
  | { type: 'category'; categoryKey: string }
  | { type: 'offer'; offerKey: string };

/**
 * Points a record at an existing media row.
 *
 * Both sides are tenant-checked: the media must belong to this business *and*
 * so must the target. Without the first check, a known media id from another
 * tenant could be displayed on this profile.
 */
export async function assignMedia(
  user: AuthenticatedUser,
  businessId: string,
  mediaId: string | null,
  target: AssignTarget,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  if (mediaId) {
    const media = await prisma.media.findFirst({
      where: { id: mediaId, ...tenantScope(context) },
      select: { id: true },
    });

    if (!media) throw new TenantAccessError('Media not found');
  }

  switch (target.type) {
    case 'business-logo':
      await prisma.business.update({
        where: { id: context.businessId },
        data: { logoMediaId: mediaId },
      });
      break;

    case 'business-og':
      await prisma.business.update({
        where: { id: context.businessId },
        data: { ogMediaId: mediaId },
      });
      break;

    case 'item': {
      const result = await prisma.menuItem.updateMany({
        where: { itemCode: target.itemCode, ...tenantScope(context) },
        data: { imageMediaId: mediaId },
      });
      if (result.count === 0) throw new TenantAccessError('Item not found');
      break;
    }

    case 'category': {
      const result = await prisma.menuCategory.updateMany({
        where: { key: target.categoryKey, ...tenantScope(context) },
        data: { imageMediaId: mediaId },
      });
      if (result.count === 0) throw new TenantAccessError('Category not found');
      break;
    }

    case 'offer': {
      const result = await prisma.offer.updateMany({
        where: { key: target.offerKey, ...tenantScope(context) },
        data: { imageMediaId: mediaId },
      });
      if (result.count === 0) throw new TenantAccessError('Offer not found');
      break;
    }
  }

  await recordAudit({
    action: 'file.updated',
    entity: 'media',
    entityId: mediaId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { target: target.type, assigned: mediaId !== null },
  });
}

export async function listMedia(user: AuthenticatedUser, businessId: string) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const media = await prisma.media.findMany({
    where: tenantScope(context),
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const storage = getStorage();

  return media.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    url: storage.publicUrl(entry.storageKey),
    altAr: entry.altAr,
    altEn: entry.altEn,
    originalName: entry.originalName,
    sizeBytes: entry.sizeBytes,
    createdAt: entry.createdAt,
  }));
}

/**
 * Deletes a media row and its object.
 *
 * Every reference is cleared first, so nothing is left pointing at a missing
 * image — a broken image on a customer's menu is worse than a missing one
 * (master spec §120).
 */
export async function deleteMedia(user: AuthenticatedUser, businessId: string, mediaId: string) {
  const context = await requireTenantContext(user, businessId, 'MANAGER');

  const media = await prisma.media.findFirst({
    where: { id: mediaId, ...tenantScope(context) },
    select: { id: true, storageKey: true },
  });

  if (!media) throw new TenantAccessError('Media not found');

  await prisma.$transaction([
    prisma.business.updateMany({
      where: { logoMediaId: media.id },
      data: { logoMediaId: null },
    }),
    prisma.business.updateMany({ where: { ogMediaId: media.id }, data: { ogMediaId: null } }),
    prisma.menuItem.updateMany({ where: { imageMediaId: media.id }, data: { imageMediaId: null } }),
    prisma.menuCategory.updateMany({
      where: { imageMediaId: media.id },
      data: { imageMediaId: null },
    }),
    prisma.offer.updateMany({ where: { imageMediaId: media.id }, data: { imageMediaId: null } }),
    prisma.media.delete({ where: { id: media.id } }),
  ]);

  try {
    await getStorage().delete(media.storageKey);
  } catch (error) {
    // An orphaned object costs pennies; a failed delete must not roll back the
    // reference cleanup that already committed.
    console.error('[media] failed to delete stored object', {
      key: media.storageKey,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }

  await recordAudit({
    action: 'file.deleted',
    entity: 'media',
    entityId: mediaId,
    businessId: context.businessId,
    userId: user.id,
  });
}

function buildMediaKey(context: TenantContext, extension: string): string {
  const nonce = randomBytes(8).toString('hex');
  return `businesses/${context.businessId}/media/${nonce}${extension}`;
}
