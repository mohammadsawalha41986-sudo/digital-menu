'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { uploadLogoAction } from '@/server/admin/wizard-actions';
import type { ActionState } from '@/server/admin/actions';
import type { BrandPresetView } from '@/server/brand/service';

/**
 * Step 2 — the logo, and the identity that comes out of it.
 *
 * One control: the file. Colours, typography and page tone are measured from
 * the image and applied, because the spec is explicit that an owner should not
 * be asked to type a hex value to get started. Everything stays editable in
 * Design afterwards.
 */
export function BrandStep({
  businessId,
  preset,
  images,
  typographyLabels,
}: {
  businessId: string;
  preset: BrandPresetView | null;
  images: { id: string; url: string; alt: string }[];
  typographyLabels: { heading: string; body: string };
}) {
  const [state, submit] = useActionState<ActionState, FormData>(uploadLogoAction, {});

  return (
    <div className="build__stack">
      <form action={submit} className="build__card" encType="multipart/form-data">
        <h2 className="build__step-title">Upload your logo</h2>
        <p className="build__lede">
          Your menu takes its colours from your logo, so this one step sets the whole look.
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

        <div className="build__upload">
          <label className="admin__label" htmlFor="logo-file">
            Logo image
          </label>
          <input
            id="logo-file"
            name="file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="admin__input"
          />
          <span className="admin__hint">PNG, JPEG or WebP.</span>
        </div>

        <Submit label="Upload logo" pending="Reading your logo…" />
      </form>

      {images.length > 0 ? (
        <form action={submit} className="build__card">
          <h3 className="build__step-subtitle">Or choose one you already uploaded</h3>
          <input type="hidden" name="businessId" value={businessId} />

          <div className="build__thumbs" role="radiogroup" aria-label="Choose a logo">
            {images.map((image) => (
              <label key={image.id} className="build__thumb">
                <input type="radio" name="mediaId" value={image.id} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt} loading="lazy" />
              </label>
            ))}
          </div>

          <Submit label="Use this logo" pending="Reading your logo…" secondary />
        </form>
      ) : null}

      {preset ? (
        <section className="build__card">
          <h3 className="build__step-subtitle">Your brand</h3>

          {!preset.fromLogo ? (
            <p className="admin__message admin__message--error" role="status">
              No colours could be measured from that image, so these are platform defaults. You
              can set them by hand in Design.
            </p>
          ) : null}

          <ul className="studio__palette">
            {Object.entries(preset.palette).map(([role, colour]) => (
              <li key={role}>
                <span
                  className="studio__swatch studio__swatch--large"
                  style={{ background: colour }}
                  aria-hidden="true"
                />
                <span className="studio__palette-role">{role}</span>
                <code>{colour}</code>
              </li>
            ))}
          </ul>

          <dl className="build__facts">
            <div>
              <dt>Headings</dt>
              <dd>{typographyLabels.heading}</dd>
            </div>
            <div>
              <dt>Body</dt>
              <dd>{typographyLabels.body}</dd>
            </div>
            <div>
              <dt>Page</dt>
              <dd>{preset.tone === 'dark' ? 'Dark' : 'Light'}</dd>
            </div>
            {preset.mood.length > 0 ? (
              <div>
                <dt>Reads as</dt>
                <dd>{preset.mood.join(', ')}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function Submit({
  label,
  pending,
  secondary,
}: {
  label: string;
  pending: string;
  secondary?: boolean;
}) {
  const status = useFormStatus();

  return (
    <div className="build__actions">
      <button
        type="submit"
        className={secondary ? 'admin__button admin__button--secondary' : 'admin__button'}
        disabled={status.pending}
      >
        {status.pending ? pending : label}
      </button>
    </div>
  );
}
