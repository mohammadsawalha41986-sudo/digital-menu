'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signInAction, type SignInState } from '@/server/auth/actions';

/**
 * Sign-in form.
 *
 * Progressive by construction: it is a real `<form>` posting to a server
 * action, so it works before hydration. The client boundary buys only the
 * pending state and the inline error.
 */
export function SignInForm() {
  const [state, formAction] = useActionState<SignInState, FormData>(signInAction, {});

  return (
    <form action={formAction} className="admin__form">
      {state.error ? (
        <p className="admin__message admin__message--error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="admin__field">
        <label className="admin__label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="admin__input"
          autoComplete="username"
          required
        />
      </div>

      <div className="admin__field">
        <label className="admin__label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="admin__input"
          autoComplete="current-password"
          required
        />
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="admin__button" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}
