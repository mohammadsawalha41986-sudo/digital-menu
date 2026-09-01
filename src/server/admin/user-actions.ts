'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/server/auth/current-user';
import { assertPasswordPolicy, PasswordPolicyError } from '@/server/auth/password';
import {
  changeOwnPassword,
  createStaffUser,
  grantBusinessAccess,
  resetStaffPassword,
  revokeBusinessAccess,
  setPlatformRole,
  setStaffActive,
} from './user-service';
import { ValidationError } from './business-service';
import { formDataToObject } from './validation';
import type { ActionState } from './actions';

/**
 * Staff account actions.
 *
 * A generated password is returned in the action state so it can be shown
 * once, then never again — the same contract the seed already has. It is
 * deliberately not emailed: this platform sends no mail, and pretending
 * otherwise would leave an administrator waiting for a message that never
 * arrives.
 */

export interface StaffActionState extends ActionState {
  /** Shown once, immediately after creation or a reset. */
  password?: string;
  email?: string;
}

async function run(work: () => Promise<string>): Promise<ActionState> {
  try {
    return { ok: true, message: await work() };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof PasswordPolicyError) {
      return { error: error.message };
    }
    console.error('[admin] staff action failed', error);
    return { error: 'Something went wrong' };
  }
}

const createSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().min(1).max(120),
  role: z.enum(['SUPER_ADMIN', 'STAFF']),
});

export async function createStaffAction(
  _previous: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const actor = await requireUser();
  const parsed = createSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    const { user, password } = await createStaffUser(actor, parsed.data);

    revalidatePath('/admin/staff');

    return {
      ok: true,
      message: `Account created for ${user.email}. The password below is shown once.`,
      password,
      email: user.email,
    };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    console.error('[admin] create staff failed', error);
    return { error: 'Something went wrong' };
  }
}

export async function setStaffActiveAction(
  userId: string,
  isActive: boolean,
): Promise<ActionState> {
  const actor = await requireUser();

  return run(async () => {
    await setStaffActive(actor, userId, isActive);
    revalidatePath('/admin/staff');
    return isActive ? 'Account reactivated' : 'Account deactivated';
  });
}

export async function setPlatformRoleAction(
  userId: string,
  role: 'SUPER_ADMIN' | 'STAFF',
): Promise<ActionState> {
  const actor = await requireUser();

  return run(async () => {
    await setPlatformRole(actor, userId, role);
    revalidatePath('/admin/staff');
    return `Role changed to ${role === 'SUPER_ADMIN' ? 'super admin' : 'staff'}`;
  });
}

export async function resetStaffPasswordAction(userId: string): Promise<StaffActionState> {
  const actor = await requireUser();

  try {
    const { password } = await resetStaffPassword(actor, userId);
    revalidatePath('/admin/staff');
    return { ok: true, message: 'New password generated. It is shown once.', password };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    console.error('[admin] reset password failed', error);
    return { error: 'Something went wrong' };
  }
}

const grantSchema = z.object({
  userId: z.string().min(1),
  businessId: z.string().min(1),
  role: z.enum(['VIEWER', 'EDITOR', 'MANAGER', 'OWNER']),
});

export async function grantAccessAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();
  const parsed = grantSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: 'Choose a person, a business and a role' };

  return run(async () => {
    await grantBusinessAccess(
      actor,
      parsed.data.userId,
      parsed.data.businessId,
      parsed.data.role,
    );
    revalidatePath('/admin/staff');
    return 'Access granted';
  });
}

export async function revokeAccessAction(
  userId: string,
  businessId: string,
): Promise<ActionState> {
  const actor = await requireUser();

  return run(async () => {
    await revokeBusinessAccess(actor, userId, businessId);
    revalidatePath('/admin/staff');
    return 'Access revoked';
  });
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
  confirmPassword: z.string().min(1),
});

export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireUser();
  const parsed = passwordSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: 'Fill in every field' };

  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { error: 'The two new passwords do not match' };
  }

  return run(async () => {
    // Policy is checked here so the message names the rule that failed, rather
    // than surfacing as a generic failure from deeper down.
    assertPasswordPolicy(parsed.data.newPassword);
    await changeOwnPassword(actor, parsed.data.currentPassword, parsed.data.newPassword);
    return 'Password changed';
  });
}
