'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/server/admin/actions';

/**
 * Step 6 — photographs.
 *
 * The library is thumbnails, and assigning is picking a picture and picking a
 * dish. No filenames, no media ids: the spec's complaint about the old admin
 * was precisely that those were the interface.
 */

export interface ImageTarget {
  code: string;
  label: string;
  currentUrl: string | null;
}

export function ImagesStep({
  images,
  items,
  uploadMedia,
  assignMedia,
}: {
  images: { id: string; url: string; alt: string }[];
  items: ImageTarget[];
  /** The existing media actions, already bound to this business by the page. */
  uploadMedia: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  assignMedia: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [uploadState, upload] = useActionState<ActionState, FormData>(uploadMedia, {});
  const [assignState, assign] = useActionState<ActionState, FormData>(assignMedia, {});

  return (
    <div className="build__stack">
      <form action={upload} className="build__card" encType="multipart/form-data">
        <h2 className="build__step-title">Add your photos</h2>

        {uploadState.error ? (
          <p className="admin__message admin__message--error" role="alert">
            {uploadState.error}
          </p>
        ) : null}
        {uploadState.ok && uploadState.message ? (
          <p className="admin__message admin__message--ok" role="status">
            {uploadState.message}
          </p>
        ) : null}

        <input type="hidden" name="kind" value="ITEM_IMAGE" />

        <div className="admin__grid">
          <div className="admin__field">
            <label className="admin__label" htmlFor="image-file">
              Photo
            </label>
            <input
              id="image-file"
              name="file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="admin__input"
              required
            />
          </div>
          <div className="admin__field">
            <label className="admin__label" htmlFor="image-alt">
              What it shows
            </label>
            <input
              id="image-alt"
              name="altEn"
              className="admin__input"
              placeholder="Grilled lamb chops"
            />
            <span className="admin__hint">Read aloud to visitors who cannot see the photo.</span>
          </div>
        </div>

        <Submit label="Upload photo" />
      </form>

      <section className="build__card">
        <h3 className="build__step-subtitle">Your photos</h3>

        {images.length === 0 ? (
          <p className="admin__empty">Nothing uploaded yet.</p>
        ) : (
          <div className="build__thumbs build__thumbs--library">
            {images.map((image) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={image.id} src={image.url} alt={image.alt} loading="lazy" />
            ))}
          </div>
        )}
      </section>

      {items.length > 0 && images.length > 0 ? (
        <form action={assign} className="build__card">
          <h3 className="build__step-subtitle">Put a photo on a dish</h3>

          {assignState.error ? (
            <p className="admin__message admin__message--error" role="alert">
              {assignState.error}
            </p>
          ) : null}
          {assignState.ok && assignState.message ? (
            <p className="admin__message admin__message--ok" role="status">
              {assignState.message}
            </p>
          ) : null}

          <input type="hidden" name="targetType" value="item" />

          <div className="admin__field">
            <label className="admin__label" htmlFor="assign-item">
              Dish
            </label>
            <select id="assign-item" name="targetKey" className="admin__select">
              {items.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                  {item.currentUrl ? ' — has a photo' : ''}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="admin__fieldset">
            <legend className="admin__label">Photo</legend>
            <div className="build__thumbs" role="radiogroup" aria-label="Choose a photo">
              {images.map((image) => (
                <label key={image.id} className="build__thumb">
                  <input type="radio" name="mediaId" value={image.id} required />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={image.alt} loading="lazy" />
                </label>
              ))}
            </div>
          </fieldset>

          <Submit label="Use this photo" />
        </form>
      ) : null}
    </div>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <div className="build__actions">
      <button type="submit" className="admin__button" disabled={pending}>
        {pending ? `${label}…` : label}
      </button>
    </div>
  );
}
