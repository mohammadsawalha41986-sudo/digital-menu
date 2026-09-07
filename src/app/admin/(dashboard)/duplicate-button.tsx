'use client';

import { useActionState } from 'react';
import {
  duplicateCategoryAction,
  duplicateItemAction,
  duplicateMenuAction,
} from '@/server/admin/structure-actions';
import type { ActionState } from '@/server/admin/actions';

const ACTIONS = {
  menu: { action: duplicateMenuAction, field: 'menuId' },
  category: { action: duplicateCategoryAction, field: 'categoryId' },
  item: { action: duplicateItemAction, field: 'itemId' },
} as const;

/**
 * "Duplicate", for a menu, a section or a dish.
 *
 * The most common menu edit is not writing something new — it is the dish
 * above with a different name, or last year's menu with eight prices changed.
 * Without this, that work is retyping, and retyping is how a menu ends up
 * maintained in a spreadsheet instead.
 */
export function DuplicateButton({
  businessId,
  scope,
  id,
  label,
}: {
  businessId: string;
  scope: keyof typeof ACTIONS;
  id: string;
  label: string;
}) {
  const { action, field } = ACTIONS[scope];
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="admin__inline-form">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name={field} value={id} />
      <button
        type="submit"
        className="admin__button admin__button--secondary"
        aria-label={`Duplicate ${label}`}
      >
        Duplicate
      </button>
      {state.error ? (
        <span className="admin__message admin__message--error" role="alert">
          {state.error}
        </span>
      ) : null}
      {state.ok && state.message ? (
        <span className="admin__message admin__message--ok" role="status">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
