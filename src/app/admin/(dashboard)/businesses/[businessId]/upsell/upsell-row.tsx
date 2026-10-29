'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
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
  const [state, submit] = useActionState<ActionState, FormData>(action, {});

  return (
    <li className="upsell__row" data-upsell={code}>
      <form action={submit} className="upsell__form">
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

        <Save />
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

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="admin__button admin__button--small" disabled={pending}>
      {pending ? '…' : 'حفظ · Save'}
    </button>
  );
}
