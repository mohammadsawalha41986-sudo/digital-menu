'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { getEnv } from '@/lib/env';
import { createStaffLink, revokeStaffLink } from '@/server/staff/service';
import { ValidationError } from './business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import type { ActionState } from './actions';

export interface StaffLinkState extends ActionState {
  /** The full address, shown once. The secret is not stored anywhere. */
  url?: string;
}

const SHARE_PATH = (businessId: string) => `/admin/businesses/${businessId}/share`;

export async function createStaffLinkAction(
  businessId: string,
  _previous: StaffLinkState,
  formData: FormData,
): Promise<StaffLinkState> {
  const user = await requireUser();

  const label = typeof formData.get('label') === 'string' ? (formData.get('label') as string) : '';
  const days = Number(formData.get('days') ?? 180);

  try {
    const { token } = await createStaffLink(user, businessId, {
      label,
      days: Number.isFinite(days) ? days : 180,
    });

    revalidatePath(SHARE_PATH(businessId));

    // Built from PUBLIC_URL, the same origin as the menu, so the link works
    // wherever the menu does.
    const base = getEnv().PUBLIC_URL.replace(/\/$/, '');

    return {
      ok: true,
      message: 'Link created. Copy it now — it is shown once.',
      url: `${base}/staff/${token}`,
    };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    if (error instanceof TenantAccessError) return { error: 'Not found' };
    console.error('[admin] staff link failed', error);
    return { error: 'Something went wrong' };
  }
}

export async function revokeStaffLinkAction(businessId: string, linkId: string): Promise<ActionState> {
  const user = await requireUser();

  try {
    await revokeStaffLink(user, businessId, linkId);
    revalidatePath(SHARE_PATH(businessId));
    return { ok: true, message: 'Link revoked. It stops working at once.' };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    if (error instanceof TenantAccessError) return { error: 'Not found' };
    console.error('[admin] revoke staff link failed', error);
    return { error: 'Something went wrong' };
  }
}
