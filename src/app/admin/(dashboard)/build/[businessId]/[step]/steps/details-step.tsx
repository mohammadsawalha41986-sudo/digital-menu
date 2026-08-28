'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveDetailsAction } from '@/server/admin/wizard-actions';
import type { ActionState } from '@/server/admin/actions';

/**
 * Steps 4 and 9 — what the menu says about the restaurant, and how to reach it.
 *
 * Nothing here is required. An empty field is simply absent from the menu:
 * the public templates hide an action they have no value for, so a restaurant
 * with no TikTok never shows a dead TikTok button.
 */

export interface DetailsValues {
  descriptionAr: string;
  descriptionEn: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  googleMapsUrl: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  youtube: string;
  linkedin: string;
  addressAr: string;
  addressEn: string;
}

const CONTACT: [keyof DetailsValues, string, string][] = [
  ['phone', 'Phone', '+966 55 000 0000'],
  ['whatsapp', 'WhatsApp', '+966 55 000 0000'],
  ['email', 'Email', 'hello@example.com'],
  ['website', 'Website', 'https://example.com'],
  ['googleMapsUrl', 'Google Maps', 'https://maps.app.goo.gl/…'],
  ['instagram', 'Instagram', 'https://instagram.com/…'],
  ['facebook', 'Facebook', 'https://facebook.com/…'],
  ['tiktok', 'TikTok', 'https://tiktok.com/@…'],
  ['youtube', 'YouTube', 'https://youtube.com/@…'],
  ['linkedin', 'LinkedIn', 'https://linkedin.com/company/…'],
];

export function DetailsStep({
  businessId,
  values,
  variant,
}: {
  businessId: string;
  values: DetailsValues;
  /** `about` shows description and address; `connect` shows only the links. */
  variant: 'about' | 'connect';
}) {
  const [state, submit] = useActionState<ActionState, FormData>(saveDetailsAction, {});

  return (
    <form action={submit} className="build__card">
      <h2 className="build__step-title">
        {variant === 'about' ? 'Tell people about the place' : 'Connect your restaurant'}
      </h2>
      <p className="build__lede">
        Only what you fill in appears on the menu. Leave the rest empty.
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

      {variant === 'about' ? (
        <>
          <div className="admin__field">
            <label className="admin__label" htmlFor="description-ar">
              About, in Arabic
            </label>
            <textarea
              id="description-ar"
              name="descriptionAr"
              dir="rtl"
              rows={3}
              className="admin__input"
              defaultValue={values.descriptionAr}
            />
          </div>

          <div className="admin__field">
            <label className="admin__label" htmlFor="description-en">
              About, in English
            </label>
            <textarea
              id="description-en"
              name="descriptionEn"
              rows={3}
              className="admin__input"
              defaultValue={values.descriptionEn}
            />
            <span className="admin__hint">
              Written by you in each language — the platform never translates for you.
            </span>
          </div>

          <div className="admin__grid">
            <div className="admin__field">
              <label className="admin__label" htmlFor="address-ar">
                Address, in Arabic
              </label>
              <input
                id="address-ar"
                name="addressAr"
                dir="rtl"
                className="admin__input"
                defaultValue={values.addressAr}
              />
            </div>
            <div className="admin__field">
              <label className="admin__label" htmlFor="address-en">
                Address, in English
              </label>
              <input
                id="address-en"
                name="addressEn"
                className="admin__input"
                defaultValue={values.addressEn}
              />
            </div>
          </div>
        </>
      ) : null}

      <div className="admin__grid">
        {CONTACT.map(([field, label, placeholder]) => (
          <div className="admin__field" key={field}>
            <label className="admin__label" htmlFor={`field-${field}`}>
              {label}
            </label>
            <input
              id={`field-${field}`}
              name={field}
              className="admin__input"
              placeholder={placeholder}
              defaultValue={values[field]}
            />
          </div>
        ))}
      </div>

      <Save />
    </form>
  );
}

function Save() {
  const { pending } = useFormStatus();

  return (
    <div className="build__actions">
      <button type="submit" className="admin__button" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
