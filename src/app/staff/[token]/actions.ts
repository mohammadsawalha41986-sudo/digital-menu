'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { ValidationError } from '@/server/admin/business-service';
import { RULES, clientIdentity, consume } from '@/server/security/rate-limit';
import { setStaffAvailability } from '@/server/staff/availability';
import { invalidateProfile } from '@/server/profile/cache';

export interface StaffState {
  ok?: boolean;
  message?: string;
  error?: string;
}

/**
 * One dish's state, changed from a staff link. The token travels in the form
 * and is checked again here, every time: a page that loaded before a revoke
 * must not keep working.
 */
export async function setStaffAvailabilityAction(_previous: StaffState, formData: FormData): Promise<StaffState> {
  const token = String(formData.get('token') ?? '');
  const itemCode = String(formData.get('itemCode') ?? '');
  const status = String(formData.get('status') ?? '');

  const headerStore = await headers();
  if (consume(RULES.staffToken, clientIdentity(headerStore)).limited) {
    return { error: 'Too many changes at once. Wait a moment and try again.' };
  }

  try {
    const { message, publicId } = await setStaffAvailability(token, itemCode, status);
    // The public menu is cached; a change must show there straight away.
    invalidateProfile(publicId);
    revalidatePath(`/staff/${token}`);
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    console.error('[staff] availability change failed', error);
    return { error: 'Could not save. Try again.' };
  }
}
