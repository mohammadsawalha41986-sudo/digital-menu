'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { prisma } from '@/server/db/client';
import { FileValidationError } from '@/server/files/validation';
import {
  assignPlannedImages,
  describeImageAssignment,
  planImageAssignment,
} from '@/server/import/image-assignment';
import { ImageZipError, parseImageZip } from '@/server/import/image-zip';
import { invalidateProfile } from '@/server/profile/cache';
import type { ActionState } from './actions';

export interface ImageZipPreviewState extends ActionState {
  preview?: {
    fileName: string;
    digest: string;
    imageCount: number;
    matchedCount: number;
    replacedCount: number;
    unmatchedCount: number;
    matches: { fileName: string; itemCode: string; itemName: string; replaces: boolean }[];
    unmatched: { fileName: string; itemCode: string }[];
  };
}

const MAX_PREVIEW_ROWS = 100;

/** Staff must hold this business, or the archive is never even read. */
async function assertBusinessAccess(businessId: string, userId: string, isSuperAdmin: boolean) {
  return prisma.business.findFirst({
    where: {
      id: businessId,
      ...(isSuperAdmin ? {} : { memberships: { some: { userId } } }),
    },
    select: { id: true },
  });
}

/**
 * Read-only first step for bulk photography. Image file basenames are matched
 * to the stable item_id/itemCode used by spreadsheet import and export.
 *
 * Nothing is stored and nothing is written: the operator sees exactly what the
 * archive would do — assigned, replaced, unmatched — and can walk away.
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

  const business = await assertBusinessAccess(businessId, user.id, user.role === 'SUPER_ADMIN');
  if (!business) return { error: 'Not found or access denied' };

  try {
    const archive = new Uint8Array(await file.arrayBuffer());
    const entries = parseImageZip(archive);
    const plan = await planImageAssignment(businessId, entries);

    const names = await prisma.menuItem.findMany({
      where: { businessId, itemCode: { in: plan.matched.map((match) => match.itemCode) } },
      select: { itemCode: true, nameAr: true, nameEn: true },
    });
    const nameByCode = new Map(names.map((item) => [item.itemCode, item.nameEn ?? item.nameAr]));

    return {
      preview: {
        fileName: file.name,
        digest: createHash('sha256').update(archive).digest('hex'),
        imageCount: entries.length,
        matchedCount: plan.matched.length,
        replacedCount: plan.matched.filter((match) => match.hadImage).length,
        unmatchedCount: plan.unmatched.length,
        matches: plan.matched.slice(0, MAX_PREVIEW_ROWS).map((match) => ({
          fileName: match.entry.fileName,
          itemCode: match.itemCode,
          itemName: nameByCode.get(match.itemCode) ?? match.itemCode,
          replaces: match.hadImage,
        })),
        unmatched: plan.unmatched.slice(0, MAX_PREVIEW_ROWS),
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
 * hidden field. The archive digest must equal the read-only preview, so the
 * operator cannot approve one ZIP and import another, and the whole archive is
 * validated again before the first upload.
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

  const business = await assertBusinessAccess(businessId, user.id, user.role === 'SUPER_ADMIN');
  if (!business) return { error: 'Not found or access denied' };

  try {
    const archive = new Uint8Array(await file.arrayBuffer());
    if (createHash('sha256').update(archive).digest('hex') !== expectedDigest) {
      return { error: 'This ZIP is different from the one you previewed. Preview it first.' };
    }

    const plan = await planImageAssignment(businessId, parseImageZip(archive));
    if (plan.matched.length === 0) {
      return { error: 'None of the image filenames match an existing item_id' };
    }

    const report = await assignPlannedImages(user, businessId, plan);

    revalidatePath(`/admin/businesses/${businessId}/data`);
    revalidatePath(`/admin/businesses/${businessId}/media`);
    revalidatePath(`/admin/businesses/${businessId}/studio`);
    revalidatePath(`/m/${publicId}`);
    invalidateProfile(publicId);

    const summary = describeImageAssignment(report);
    const notAssigned = report.failed.length > 0 ? ` Not assigned: ${report.failed.join(', ')}.` : '';

    if (report.created === 0 && report.replaced === 0) {
      return { error: `No images were assigned — ${summary}.${notAssigned}` };
    }

    return {
      ok: true,
      message:
        `Item photography updated: ${summary}.${notAssigned} ` +
        'Items with no image in the ZIP keep the photograph they had, and the QR is unchanged.',
    };
  } catch (error) {
    if (error instanceof ImageZipError || error instanceof FileValidationError) {
      return { error: error.message };
    }
    return { error: error instanceof Error ? error.message : 'Image ZIP import failed' };
  }
}
