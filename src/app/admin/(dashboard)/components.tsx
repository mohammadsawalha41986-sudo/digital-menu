'use client';

import { startTransition, useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import type { ActionState } from '@/server/admin/actions';

/**
 * Form primitives shared by the admin screens.
 *
 * Each is a real `<form>` bound to a server action, so submission works
 * without JavaScript; the client boundary exists only to show pending state
 * and the action's result inline instead of navigating away.
 */

export function ActionForm({
  action,
  children,
  submitLabel,
  className = 'admin__form',
  keepValues = false,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  /**
   * Keep what is on screen after saving. A `<form action>` is reset by React
   * once the action finishes, which puts controlled fields (selects, colour
   * pickers held in state) back to the values the page first rendered with:
   * the screen then shows the old settings, and saving again writes them
   * back. Settings forms that hold their fields in state pass this.
   */
  keepValues?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, {});

  const submitWithoutReset = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };

  return (
    <form
      action={keepValues ? undefined : formAction}
      onSubmit={keepValues ? submitWithoutReset : undefined}
      className={className}
    >
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

      {children}

      <div className="admin__actions">
        <SubmitButton label={submitLabel} pending={keepValues ? isPending : undefined} />
      </div>
    </form>
  );
}

/** A button that runs a parameterless action, e.g. publish or delete. */
export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = 'secondary',
  confirm,
}: {
  action: () => Promise<ActionState>;
  label: string;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  confirm?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(async () => action(), {});

  const className =
    variant === 'primary'
      ? 'admin__button'
      : variant === 'danger'
        ? 'admin__button admin__button--danger'
        : 'admin__button admin__button--secondary';

  return (
    <form
      action={formAction}
      className="admin__actions"
      onSubmit={(event) => {
        // Destructive actions ask first; the server still re-checks authority.
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <SubmitButton label={label} pendingLabel={pendingLabel} className={className} />
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

function SubmitButton({
  label,
  pendingLabel,
  className = 'admin__button',
  pending: pendingOverride,
}: {
  label: string;
  pendingLabel?: string;
  className?: string;
  /** For forms submitted by hand, where the form status cannot see it. */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingOverride ?? status.pending;

  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingLabel ?? `${label}…`) : label}
    </button>
  );
}

/**
 * A labelled field.
 *
 * The control's DOM id is generated rather than taken from `name`: several
 * forms on one screen legitimately share a field name (an item and a category
 * both have `nameAr`), and duplicate ids would silently break every label
 * association on the page.
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  /** Receives the generated id to put on the control. */
  children: (id: string) => ReactNode;
}) {
  const id = useId();

  return (
    <div className="admin__field">
      <label className="admin__label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint ? <span className="admin__hint">{hint}</span> : null}
    </div>
  );
}

export function TextField({
  name,
  label,
  defaultValue,
  hint,
  required,
  type = 'text',
  dir,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  hint?: string;
  required?: boolean;
  type?: string;
  dir?: 'rtl' | 'ltr';
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          name={name}
          type={type}
          dir={dir}
          defaultValue={defaultValue ?? ''}
          required={required}
          className="admin__input"
        />
      )}
    </Field>
  );
}

export function TextArea({
  name,
  label,
  defaultValue,
  hint,
  dir,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  hint?: string;
  dir?: 'rtl' | 'ltr';
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <textarea
          id={id}
          name={name}
          dir={dir}
          defaultValue={defaultValue ?? ''}
          className="admin__textarea"
        />
      )}
    </Field>
  );
}

export function SelectField({
  name,
  label,
  options,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} name={name} defaultValue={defaultValue} className="admin__select">
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function CheckboxField({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  const id = useId();

  return (
    <div className="admin__field">
      <label className="admin__label" htmlFor={id}>
        {label}
      </label>
      <div className="admin__actions">
        {/* A hidden companion so an unchecked box still posts a value. */}
        <input type="hidden" name={name} value="" />
        <input id={id} name={name} type="checkbox" value="true" defaultChecked={defaultChecked} />
        {hint ? <span className="admin__hint">{hint}</span> : null}
      </div>
    </div>
  );
}
