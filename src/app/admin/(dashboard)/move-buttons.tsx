'use client';

import { useActionState } from 'react';
import { moveAction } from '@/server/admin/structure-actions';
import type { ActionState } from '@/server/admin/actions';

/**
 * Up/down controls for one row.
 *
 * Ordinary forms posting to a server action, so ordering works with no
 * JavaScript, from a keyboard, and under a screen reader. Dragging is a nicer
 * gesture on a desktop and an unusable one on a phone with a long menu, which
 * is where most of this editing actually happens.
 *
 * The buttons are labelled with the row they move, not "up" and "down" alone:
 * a screen reader announcing "up, up, up" down a menu of forty dishes tells
 * the listener nothing about which dish they are on.
 */
export function MoveButtons({
  businessId,
  scope,
  id,
  label,
  isFirst,
  isLast,
}: {
  businessId: string;
  scope: 'menu' | 'category' | 'item';
  id: string;
  label: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(moveAction, {});

  return (
    <form action={formAction} className="admin__move">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="id" value={id} />

      <button
        type="submit"
        name="direction"
        value="up"
        disabled={isFirst}
        aria-label={`Move ${label} up`}
        title={`Move ${label} up`}
      >
        ↑
      </button>
      <button
        type="submit"
        name="direction"
        value="down"
        disabled={isLast}
        aria-label={`Move ${label} down`}
        title={`Move ${label} down`}
      >
        ↓
      </button>

      {state.error ? (
        <span className="admin__message admin__message--error" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
