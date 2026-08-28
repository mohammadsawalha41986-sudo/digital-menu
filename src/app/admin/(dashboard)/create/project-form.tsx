'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createProjectAction } from '@/server/admin/wizard-actions';
import type { ActionState } from '@/server/admin/actions';

const TYPES = [
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'CAFE', label: 'Café' },
  { value: 'BAKERY', label: 'Bakery' },
  { value: 'DESSERT', label: 'Desserts' },
  { value: 'HOTEL', label: 'Hotel' },
  { value: 'SALON', label: 'Salon' },
  { value: 'BEAUTY_CENTER', label: 'Beauty centre' },
  { value: 'SPA', label: 'Spa' },
  { value: 'BARBER', label: 'Barber' },
  { value: 'GYM', label: 'Gym' },
  { value: 'RETAIL', label: 'Shop' },
  { value: 'OTHER', label: 'Something else' },
];

/**
 * The only screen before anything exists.
 *
 * The restaurant name fills the Arabic field when no Arabic name is given —
 * Arabic is the primary authored language, and refusing to continue would be
 * pedantry. What the platform will not do is translate it (GOALS I3).
 */
export function ProjectForm({ currencies }: { currencies: string[] }) {
  const [state, submit] = useActionState<ActionState, FormData>(createProjectAction, {});
  const [name, setName] = useState('');
  const id = useId();

  return (
    <form action={submit} className="build__card">
      {state.error ? (
        <p className="admin__message admin__message--error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="admin__field">
        <label className="admin__label" htmlFor={`${id}-name`}>
          Restaurant name
        </label>
        <input
          id={`${id}-name`}
          name="displayName"
          className="admin__input build__input--lead"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Noriva"
          required
          autoFocus
        />
      </div>

      <div className="admin__grid">
        <div className="admin__field">
          <label className="admin__label" htmlFor={`${id}-ar`}>
            Arabic name
          </label>
          <input
            id={`${id}-ar`}
            name="nameAr"
            dir="rtl"
            className="admin__input"
            placeholder="نوريفا"
          />
          <span className="admin__hint">Left empty, we use the name above.</span>
        </div>

        <div className="admin__field">
          <label className="admin__label" htmlFor={`${id}-en`}>
            English name
          </label>
          <input id={`${id}-en`} name="nameEn" className="admin__input" placeholder="Noriva" />
        </div>
      </div>

      <div className="admin__grid">
        <div className="admin__field">
          <label className="admin__label" htmlFor={`${id}-type`}>
            Business type
          </label>
          <select id={`${id}-type`} name="type" className="admin__select" defaultValue="RESTAURANT">
            {TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="admin__field">
          <label className="admin__label" htmlFor={`${id}-currency`}>
            Currency
          </label>
          <select id={`${id}-currency`} name="currency" className="admin__select" defaultValue="SAR">
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Continue />
    </form>
  );
}

function Continue() {
  const { pending } = useFormStatus();

  return (
    <div className="build__actions">
      <button type="submit" className="admin__button build__cta" disabled={pending}>
        {pending ? 'Creating…' : 'Continue'}
      </button>
    </div>
  );
}
