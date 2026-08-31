'use client';

import { ActionButton } from '../../../../../components';
import type { ActionState } from '@/server/admin/actions';

/**
 * Restoring is destructive to the *draft*, so it asks first — and the
 * confirmation says what will and will not happen, because "are you sure?"
 * on its own tells an operator nothing they did not already know.
 */
export function RestoreButton({
  action,
  version,
}: {
  action: () => Promise<ActionState>;
  version: number;
}) {
  return (
    <ActionButton
      action={action}
      label={`Restore v${version}`}
      pendingLabel="Restoring…"
      confirm={`Restore version ${version}? This replaces the current menu content and publishes it as a new version. The QR code and the public link do not change, and nothing is deleted from history.`}
    />
  );
}
