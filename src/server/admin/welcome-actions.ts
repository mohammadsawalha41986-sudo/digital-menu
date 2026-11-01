'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { assignMedia, uploadMedia } from '@/server/media/service';
import { invalidateProfile } from '@/server/profile/cache';
import { getBusinessNav } from './restaurant-nav';
import type { ActionState } from './actions';

/**
 * The restaurant's own figure for the welcome message. It is uploaded like any
 * other image of the restaurant and then pointed at by the restaurant, so it is
 * checked, stored and tenant-scoped the same way as the logo.
 */

export async function uploadWelcomeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  try {
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image file first.' };

    const business = await getBusinessNav(user, businessId);
    const media = await uploadMedia(user, businessId, {
      kind: 'GALLERY',
      altEn: 'Welcome figure',
      upload: {
        fileName: file.name,
        declaredContentType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    });
    await assignMedia(user, businessId, media.id, { type: 'business-welcome' });

    invalidateProfile(business.publicId);
    revalidatePath(`/admin/businesses/${businessId}/design`);
    return { ok: true, message: 'Welcome figure saved. Open the menu to see it.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The figure could not be saved.' };
  }
}

export async function removeWelcomeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  try {
    const business = await getBusinessNav(user, businessId);
    await assignMedia(user, businessId, null, { type: 'business-welcome' });

    invalidateProfile(business.publicId);
    revalidatePath(`/admin/businesses/${businessId}/design`);
    return { ok: true, message: 'Welcome figure removed.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The figure could not be removed.' };
  }
}
