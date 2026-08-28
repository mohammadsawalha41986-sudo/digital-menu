'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/server/auth/current-user';
import { invalidateProfile } from '@/server/profile/cache';
import { TenantAccessError } from '@/server/tenancy/context';
import { FileValidationError } from '@/server/files/validation';
import { assignMedia, deleteMedia, uploadMedia, type AssignTarget } from '@/server/media/service';
import { formDataToObject } from './validation';
import type { ActionState } from './actions';

const uploadSchema = z.object({
  kind: z.enum(['LOGO', 'ITEM_IMAGE', 'CATEGORY_IMAGE', 'OFFER_IMAGE', 'GALLERY', 'OG_IMAGE']),
  altAr: z.string().trim().max(300).optional().transform((value) => value || null),
  altEn: z.string().trim().max(300).optional().transform((value) => value || null),
  width: z.coerce.number().int().min(0).max(20000).optional(),
  height: z.coerce.number().int().min(0).max(20000).optional(),
});

const assignSchema = z.object({
  mediaId: z.string().trim().max(64).optional().transform((value) => value || null),
  targetType: z.enum(['business-logo', 'business-og', 'item', 'category', 'offer']),
  targetKey: z.string().trim().max(64).optional().default(''),
});

export async function uploadMediaAction(
  businessId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = uploadSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image' };

  try {
    await uploadMedia(user, businessId, {
      kind: parsed.data.kind,
      altAr: parsed.data.altAr,
      altEn: parsed.data.altEn,
      width: parsed.data.width ?? null,
      height: parsed.data.height ?? null,
      upload: {
        fileName: file.name,
        declaredContentType: file.type || 'application/octet-stream',
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    });

    revalidatePath(`/admin/businesses/${businessId}/media`);
    revalidatePath(`/admin/build/${businessId}`, 'layout');
    invalidateProfile(publicId);

    return { ok: true, message: 'Image uploaded' };
  } catch (error) {
    if (error instanceof FileValidationError) return { error: error.message };
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}

export async function assignMediaAction(
  businessId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = assignSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { mediaId, targetType, targetKey } = parsed.data;

  if (targetType !== 'business-logo' && targetType !== 'business-og' && !targetKey) {
    return { error: 'Choose what to assign the image to' };
  }

  const target: AssignTarget =
    targetType === 'business-logo'
      ? { type: 'business-logo' }
      : targetType === 'business-og'
        ? { type: 'business-og' }
        : targetType === 'item'
          ? { type: 'item', itemCode: targetKey.toUpperCase() }
          : targetType === 'category'
            ? { type: 'category', categoryKey: targetKey.toLowerCase() }
            : { type: 'offer', offerKey: targetKey.toLowerCase() };

  try {
    await assignMedia(user, businessId, mediaId, target);

    revalidatePath(`/admin/businesses/${businessId}/media`);
    revalidatePath(`/admin/businesses/${businessId}/menus`);
    revalidatePath(`/admin/build/${businessId}`, 'layout');
    revalidatePath(`/admin/preview/${businessId}`);
    revalidatePath(`/m/${publicId}`);
    invalidateProfile(publicId);

    return { ok: true, message: mediaId ? 'Image assigned' : 'Image cleared' };
  } catch (error) {
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}

export async function deleteMediaAction(
  businessId: string,
  mediaId: string,
  publicId: string,
): Promise<ActionState> {
  const user = await requireUser();

  try {
    await deleteMedia(user, businessId, mediaId);

    revalidatePath(`/admin/businesses/${businessId}/media`);
    revalidatePath(`/m/${publicId}`);
    invalidateProfile(publicId);

    return { ok: true, message: 'Image removed, and every reference to it cleared' };
  } catch (error) {
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}
