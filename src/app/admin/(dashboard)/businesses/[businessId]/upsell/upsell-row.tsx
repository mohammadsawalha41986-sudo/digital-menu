'use client';

import { startTransition, useActionState } from 'react';
import type { ActionState } from '@/server/admin/actions';

export function UpsellRow({
  code,
  name,
  pairsWith,
  automaticLinks,
  isNew,
  options,
  max,
  action,
  automatic,
}: {
  code: string;
  name: string;
  pairsWith: string[];
  /** The picks were written from the automatic suggestions, not by the restaurant. */
  automaticLinks: boolean;
  isNew: boolean;
  options: { code: string; name: string }[];
  max: number;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  /** What the menu suggests on its own for this dish, when it has no picks. */
  automatic: string[];
}) {
  const [state, submit, isPending] = useActionState<ActionState, FormData>(action, {});

  return (
    <li className="upsell__row" data-upsell={code}>
      <form
        // Submitted by hand: an action-bound form is reset by React after
        // saving, which showed the previous suggestions again.
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => submit(data));
        }}
        className="upsell__form"
      >
        <input type="hidden" name="itemCode" value={code} />
        <span className="upsell__name">{name}</span>

        <label className="upsell__new">
          <input type="checkbox" name="isNew" defaultChecked={isNew} />
          جديد · New
        </label>

        <div className="upsell__picks">
          {Array.from({ length: max }, (_, index) => (
            <select
              key={index}
              name="pairsWith"
              defaultValue={pairsWith[index] ?? ''}
              className="admin__select"
              aria-label={`${name} — اقتراح ${index + 1} · suggestion ${index + 1}`}
            >
              <option value="">— بدون · none —</option>
              {options.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          ))}
        </div>

        {automaticLinks && pairsWith.length > 0 ? (
          <span className="admin__hint upsell__auto-hint" data-auto-link={code}>
            تلقائي من المنيو · Linked automatically. Save your own picks to replace them.
          </span>
        ) : null}

        {automatic.length > 0 && pairsWith.length === 0 ? (
          <span className="admin__hint upsell__auto-hint" data-automatic={code}>
            يقترح المنيو تلقائياً: {automatic.join('، ')} · Automatic: {automatic.join(', ')}
          </span>
        ) : null}

        <Save pending={isPending} />
        {state.error ? (
          <span className="admin__message admin__message--error" role="alert">
            {state.error}
          </span>
        ) : state.ok ? (
          <span className="admin__hint" role="status">
            {state.message}
          </span>
        ) : null}
      </form>
    </li>
  );
}

function Save({ pending }: { pending: boolean }) {
  return (
    <button type="submit" className="admin__button admin__button--small" disabled={pending}>
      {pending ? '…' : 'حفظ · Save'}
    </button>
  );
}
