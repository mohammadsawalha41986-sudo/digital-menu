'use client';

import { useActionState } from 'react';
import { removeWelcomeAction, uploadWelcomeAction } from '@/server/admin/welcome-actions';
import type { ActionState } from '@/server/admin/actions';

/** Uploads or removes the restaurant's welcome figure. */
export function WelcomeForm({ businessId, hasFigure }: { businessId: string; hasFigure: boolean }) {
  const [saved, save] = useActionState<ActionState, FormData>(uploadWelcomeAction, {});
  const [removed, remove] = useActionState<ActionState, FormData>(removeWelcomeAction, {});

  const isError = Boolean(saved.error ?? removed.error);
  const message = saved.error ?? removed.error ?? saved.message ?? removed.message ?? null;

  return (
    <div className="welcome-form">
      <form action={save} encType="multipart/form-data" className="welcome-form__row">
        <input type="hidden" name="businessId" value={businessId} />
        <label htmlFor="welcome-file" className="admin__label">
          صورة الترحيب · Welcome figure
        </label>
        <input
          id="welcome-file"
          name="file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="admin__input"
          required
        />
        <button type="submit" className="admin__button">
          حفظ · Save
        </button>
      </form>

      {hasFigure ? (
        <form action={remove} className="welcome-form__row">
          <input type="hidden" name="businessId" value={businessId} />
          <button type="submit" className="admin__button admin__button--secondary">
            إزالة · Remove
          </button>
        </form>
      ) : null}

      {message ? (
        <p className={isError ? 'admin__message admin__message--error' : 'admin__hint'} role={isError ? 'alert' : 'status'}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
