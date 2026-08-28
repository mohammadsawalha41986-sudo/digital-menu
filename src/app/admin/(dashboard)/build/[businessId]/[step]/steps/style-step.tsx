'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { chooseStyleAction } from '@/server/admin/wizard-actions';
import type { ActionState } from '@/server/admin/actions';

/**
 * Step 3 — choose a style.
 *
 * Each card is a live render of *this restaurant's* menu in that style: its
 * logo, its colours, its dishes. That is why they are iframes of the preview
 * route with a `?template=` override rather than screenshots — a screenshot
 * would show somebody else's restaurant, which tells an owner nothing about
 * how their own menu will look.
 */

export interface StyleOption {
  key: string;
  label: string;
  description: string;
  themeKey: string;
}

export function StyleStep({
  businessId,
  options,
  current,
}: {
  businessId: string;
  options: StyleOption[];
  current: string;
}) {
  const [state, submit] = useActionState<ActionState, FormData>(chooseStyleAction, {});
  const [selected, setSelected] = useState(current);

  const chosen = options.find((option) => option.key === selected) ?? options[0]!;

  return (
    <form action={submit} className="build__stack">
      <div className="build__card">
        <h2 className="build__step-title">Choose your menu style</h2>
        <p className="build__lede">
          Every style below is showing your own menu, with your logo and colours.
        </p>

        {state.error ? (
          <p className="admin__message admin__message--error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.ok && state.message ? (
          <p className="admin__message admin__message--ok" role="status">
            {state.message}
          </p>
        ) : null}

        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="templateKey" value={chosen.key} />
        <input type="hidden" name="themeKey" value={chosen.themeKey} />

        <div className="build__styles" role="radiogroup" aria-label="Menu style">
          {options.map((option) => (
            <label
              key={option.key}
              className="build__style"
              data-selected={option.key === selected ? '' : undefined}
            >
              <input
                type="radio"
                name="style"
                value={option.key}
                checked={option.key === selected}
                onChange={() => setSelected(option.key)}
              />

              <span className="build__style-frame" aria-hidden="true">
                <iframe
                  title={`${option.label} preview`}
                  src={`/admin/preview/${businessId}?lang=ar&template=${option.key}`}
                  width={390}
                  height={620}
                  loading="lazy"
                  tabIndex={-1}
                />
              </span>

              <span className="build__style-name">{option.label}</span>
              <span className="build__style-note">{option.description}</span>
            </label>
          ))}
        </div>

        <Apply />
      </div>
    </form>
  );
}

function Apply() {
  const { pending } = useFormStatus();

  return (
    <div className="build__actions">
      <button type="submit" className="admin__button build__cta" disabled={pending}>
        {pending ? 'Applying…' : 'Use this style'}
      </button>
    </div>
  );
}
