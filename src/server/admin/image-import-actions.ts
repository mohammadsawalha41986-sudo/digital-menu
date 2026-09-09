'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { prisma } from '@/server/db/client';
import { FileValidationError } from '@/server/files/validation';
import { ImageZipError, normalizeItemCode, parseImageZip } from '@/server/import/image-zip';
import { assignMedia, uploadMedia } from '@/server/media/service';
import { invalidateProfile } from '@/server/profile/cache';
import type { ActionState } from './actions';

export interface ImageZipPreviewState extends ActionState {
  preview?: {
    fileName: string;
    digest: string;
    imageCount: number;
    matchedCount: number;
    unmatchedCount: number;
    matches: { fileName: string; itemCode: string; itemName: string }[];
    unmatched: { fileName: string; itemCode: string }[];
  };
}

const MAX_PREVIEW_MATCHES = 100;

/**
 * Read-only first step for bulk photography. Image file basenames are matched
 * to the stable item_id/itemCode used by spreadsheet import/export.
 */
export async function previewImageZipAction(
  businessId: string,
  _previous: ImageZipPreviewState,
  formData: FormData,
): Promise<ImageZipPreviewState> {
  const user = await requireUser();
  const file = formData.get('imageZip');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an images .zip file' };
  if (!file.name.toLowerCase().endsWith('.zip')) return { error: 'Image import must be a .zip file' };

  const business = await prisma.business.findFirst({
    where: {
      id: businessId,
      OR: [
        { memberships: { some: { userId: user.id } } },
        ...(user.role === 'SUPER_ADMIN' ? [{}] : []),
      ],
    },
    select: { id: true },
  });
  if (!business) return { error: 'Not found or access denied' };

  try {
    const archive = new Uint8Array(await file.arrayBuffer());
    const entries = parseImageZip(archive);
    const items = await prisma.menuItem.findMany({
      where: { businessId },
      select: { itemCode: true, nameAr: true, nameEn: true },
    });
    const byCode = new Map<string, { itemCode: string; nameAr: string; nameEn: string | null }>();
    for (const item of items) {
      byCode.set(normalizeItemCode(item.itemCode), {
        itemCode: item.itemCode,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
      });
    }

    const matches: { fileName: string; itemCode: string; itemName: string }[] = [];
    const unmatched: { fileName: string; itemCode: string }[] = [];
    for (const entry of entries) {
      const item = byCode.get(normalizeItemCode(entry.itemCode));
      if (item) {
        matches.push({
          fileName: entry.fileName,
          itemCode: item.itemCode,
          itemName: item.nameEn ?? item.nameAr,
        });
      } else {
        unmatched.push({ fileName: entry.fileName, itemCode: entry.itemCode });
      }
    }

    return {
      ok: true,
      message: `${matches.length} images match menu items; ${unmatched.length} do not match.`,
      preview: {
        fileName: file.name,
        digest: createHash('sha256').update(archive).digest('hex'),
        imageCount: entries.length,
        matchedCount: matches.length,
        unmatchedCount: unmatched.length,
        matches: matches.slice(0, MAX_PREVIEW_MATCHES),
        unmatched: unmatched.slice(0, MAX_PREVIEW_MATCHES),
      },
    };
  } catch (error) {
    if (error instanceof ImageZipError || error instanceof FileValidationError) {
      return { error: error.message };
    }
    throw error;
  }
}

/**
 * Re-reads the confirmed archive rather than carrying image bytes through a
 * hidden field. The archive digest must equal the read-only preview, and the
 * whole archive is validated before the first upload.
 */
export async function confirmImageZipAction(
  businessId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const file = formData.get('imageZip');
  const expectedDigest = String(formData.get('expectedDigest') ?? '');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose the same images ZIP to import' };
  if (!file.name.toLowerCase().endsWith('.zip')) return { error: 'Image import must be a .zip file' };
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) return { error: 'Preview the ZIP before importing' };

  try {
    const archive = new Uint8Array(await file.arrayBuffer());
    const actualDigest = createHash('sha256').update(archive).digest('hex');
    if (actualDigest !== expectedDigest) {
      return { error: 'This ZIP is different from the one you previewed. Preview it first.' };
    }

    const entries = parseImageZip(archive);
    const items = await prisma.menuItem.findMany({
      where: { businessId },
      select: { itemCode: true },
    });
    const canonicalCodes = new Map<string, string>();
    for (const item of items) {
      canonicalCodes.set(normalizeItemCode(item.itemCode), item.itemCode);
    }

    const matched: { entry: (typeof entries)[number]; itemCode: string }[] = [];
    for (const entry of entries) {
      const itemCode = canonicalCodes.get(normalizeItemCode(entry.itemCode));
      if (itemCode) matched.push({ entry, itemCode });
    }
    if (matched.length === 0) return { error: 'None of the image filenames match an existing item_id' };

    let assigned = 0;
    for (const { entry, itemCode } of matched) {
      const media = await uploadMedia(user, businessId, {
        kind: 'ITEM_IMAGE',
        upload: {
          fileName: entry.fileName.split('/').pop() ?? entry.fileName,
          declaredContentType: entry.contentType,
          bytes: entry.bytes,
        },
      });
      await assignMedia(user, businessId, media.id, { type: 'item', itemCode });
      assigned += 1;
    }

    revalidatePath(`/admin/businesses/${businessId}/data`);
    revalidatePath(`/admin/businesses/${businessId}/media`);
    revalidatePath(`/admin/businesses/${businessId}/studio`);
    revalidatePath(`/m/${publicId}`);
    invalidateProfile(publicId);

    const unmatched = entries.length - matched.length;
    return {
      ok: true,
      message: `Assigned ${assigned} item images${unmatched ? `; ${unmatched} unmatched filenames were skipped` : ''}. The QR is unchanged.`,
    };
  } catch (error) {
    if (error instanceof ImageZipError || error instanceof FileValidationError) {
      return { error: error.message };
    }
    return { error: error instanceof Error ? error.message : 'Image ZIP import failed' };
  }
}
