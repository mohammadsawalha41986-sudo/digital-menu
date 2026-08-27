'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/server/auth/current-user';
import { TenantAccessError } from '@/server/tenancy/context';
import {
  createExternalLink,
  deletePublicFile,
  setFileVisibility,
  uploadPublicFile,
} from '@/server/files/service';
import { FileValidationError } from '@/server/files/validation';
import { formDataToObject, keySchema } from './validation';
import type { ActionState } from './actions';

/**
 * File and link actions.
 *
 * Uploads arrive as multipart form data, so the file itself is pulled from
 * `FormData` and read into memory before validation — the size ceiling in the
 * validator is what bounds that.
 */

const metadataSchema = z.object({
  key: keySchema,
  titleAr: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().max(200).optional().transform((value) => value || null),
  descriptionAr: z.string().trim().max(1000).optional().transform((value) => value || null),
  descriptionEn: z.string().trim().max(1000).optional().transform((value) => value || null),
  isPublic: z.coerce.boolean().default(false),
  allowDownload: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

const linkSchema = metadataSchema.extend({
  externalUrl: z.string().trim().url().max(2048),
});

export async function uploadFileAction(
  businessId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = metadataSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a PDF to upload' };

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    await uploadPublicFile(user, businessId, {
      ...parsed.data,
      upload: {
        fileName: file.name,
        declaredContentType: file.type || 'application/octet-stream',
        bytes,
      },
    });

    revalidatePath(`/admin/businesses/${businessId}/files`);
    revalidatePath(`/m/${publicId}`);

    return { ok: true, message: 'File published — the QR and URL are unchanged' };
  } catch (error) {
    // The validator's messages are written for operators; surface them.
    if (error instanceof FileValidationError) return { error: error.message };
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}

export async function createLinkAction(
  businessId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = linkSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await createExternalLink(user, businessId, parsed.data);
    revalidatePath(`/admin/businesses/${businessId}/files`);
    revalidatePath(`/m/${publicId}`);
    return { ok: true, message: 'Link saved' };
  } catch (error) {
    if (error instanceof TenantAccessError) return { error: error.message };
    throw error;
  }
}

export async function toggleFileVisibilityAction(
  businessId: string,
  fileId: string,
  publicId: string,
  isPublic: boolean,
): Promise<ActionState> {
  const user = await requireUser();

  try {
    await setFileVisibility(user, businessId, fileId, isPublic);
    revalidatePath(`/admin/businesses/${businessId}/files`);
    revalidatePath(`/m/${publicId}`);
    return { ok: true, message: isPublic ? 'Published' : 'Unpublished' };
  } catch (error) {
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}

export async function deleteFileAction(
  businessId: string,
  fileId: string,
  publicId: string,
): Promise<ActionState> {
  const user = await requireUser();

  try {
    await deletePublicFile(user, businessId, fileId);
    revalidatePath(`/admin/businesses/${businessId}/files`);
    revalidatePath(`/m/${publicId}`);
    return { ok: true, message: 'File removed' };
  } catch (error) {
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}
