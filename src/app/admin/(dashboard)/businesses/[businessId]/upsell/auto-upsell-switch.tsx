'use client';

import { startTransition, useActionState } from 'react';
import type { ActionState } from '@/server/admin/actions';

/**
 * The switch for automatic suggestions across the menu. Off, a dish with no
 * picks of its own suggests nothing; picks always apply either way.
 */
export function AutoUpsellSwitch({
  enabled,
  action,
}: {
  enabled: boolean;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form
      className="admin__panel upsell__auto"
      aria-label="Automatic suggestions"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => submit(data));
      }}
    >
      <label className="options__check">
        <input type="checkbox" name="autoUpsell" defaultChecked={enabled} />
        الاقتراحات التلقائية حسب نوع القسم · Automatic suggestions by section type
      </label>
      <button type="submit" className="admin__button admin__button--small" disabled={pending}>
        حفظ · Save
      </button>
      {state.error ? (
        <span className="admin__message admin__message--error" role="alert">
          {state.error}
        </span>
      ) : state.ok && state.message ? (
        <span className="admin__hint" role="status">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
