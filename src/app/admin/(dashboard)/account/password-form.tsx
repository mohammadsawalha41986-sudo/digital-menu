'use client';

import { ActionForm, TextField } from '../components';
import type { ActionState } from '@/server/admin/actions';

export function PasswordForm({
  action,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  return (
    <ActionForm action={action} submitLabel="Change password">
      <TextField name="currentPassword" label="Current password" type="password" required />
      <TextField name="newPassword" label="New password" type="password" required />
      <TextField name="confirmPassword" label="Confirm new password" type="password" required />
    </ActionForm>
  );
}
