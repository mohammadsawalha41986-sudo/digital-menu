'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { getEnv } from '@/lib/env';
import {
  addChangeRequest,
  createPreviewLink,
  revokePreviewLink,
  setChangeRequestDone,
} from '@/server/review/service';
import { ValidationError } from './business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import type { ActionState } from './actions';

export interface PreviewLinkState extends ActionState {
  /** The full URL, shown once. The token is never stored in plaintext. */
  url?: string;
}

async function run(businessId: string, work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    revalidatePath(`/admin/businesses/${businessId}/review`);
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    if (error instanceof TenantAccessError) return { error: 'Not found' };
    console.error('[admin] review action failed', error);
    return { error: 'Something went wrong' };
  }
}

export async function createPreviewLinkAction(
  businessId: string,
  _previous: PreviewLinkState,
  formData: FormData,
): Promise<PreviewLinkState> {
  const user = await requireUser();

  const recipientNote =
    typeof formData.get('recipientNote') === 'string'
      ? (formData.get('recipientNote') as string)
      : null;
  const days = Number(formData.get('days') ?? 14);

  try {
    const { token } = await createPreviewLink(user, businessId, {
      recipientNote,
      days: Number.isFinite(days) ? days : 14,
    });

    revalidatePath(`/admin/businesses/${businessId}/review`);

    // Built from PUBLIC_URL, the same origin the QR encodes, so a link sent to
    // a client resolves wherever the profile does.
    const base = getEnv().PUBLIC_URL.replace(/\/$/, '');

    return {
      ok: true,
      message: 'Link created. Copy it now — it is shown once.',
      url: `${base}/review/${token}`,
    };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    if (error instanceof TenantAccessError) return { error: 'Not found' };
    console.error('[admin] preview link failed', error);
    return { error: 'Something went wrong' };
  }
}

export async function revokePreviewLinkAction(
  businessId: string,
  linkId: string,
): Promise<ActionState> {
  const user = await requireUser();

  return run(businessId, async () => {
    await revokePreviewLink(user, businessId, linkId);
    return 'Link revoked. Anyone holding it now sees nothing.';
  });
}

export async function addChangeRequestAction(
  businessId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const body = typeof formData.get('body') === 'string' ? (formData.get('body') as string) : '';

  return run(businessId, async () => {
    await addChangeRequest(user, businessId, body);
    return 'Change request recorded';
  });
}

export async function setChangeRequestDoneAction(
  businessId: string,
  requestId: string,
  isDone: boolean,
): Promise<ActionState> {
  const user = await requireUser();

  return run(businessId, async () => {
    await setChangeRequestDone(user, businessId, requestId, isDone);
    return isDone ? 'Marked done' : 'Reopened';
  });
}
