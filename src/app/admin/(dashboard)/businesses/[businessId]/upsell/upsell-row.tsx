'use client';

import { startTransition, useActionState } from 'react';
import type { ActionState } from '@/server/admin/actions';

export function UpsellRow({
  code,
  name,
  pairsWith,
  isNew,
  options,
  max,
  action,
}: {
  code: string;
  name: string;
  pairsWith: string[];
  isNew: boolean;
  options: { code: string; name: string }[];
  max: number;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
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
