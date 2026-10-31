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

export interface LibraryImage {
  id: string;
  url: string;
  alt: string;
  width?: number | null;
  height?: number | null;
  sizeBytes?: number;
  contentType?: string;
}

function describe(image: LibraryImage): string {
  const parts: string[] = [];
  if (image.width && image.height) parts.push(`${image.width}×${image.height}`);
  if (image.sizeBytes) parts.push(`${Math.max(1, Math.round(image.sizeBytes / 1024))} KB`);
  if (image.contentType) parts.push(image.contentType.replace('image/', '').toUpperCase());
  return parts.join(' · ');
}

export function ImagesStep({
  images,
  items,
  uploadMedia,
  assignMedia,
  deleteMedia,
}: {
  images: LibraryImage[];
  items: ImageTarget[];
  /** The existing media actions, already bound to this business by the page. */
  uploadMedia: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  assignMedia: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  deleteMedia: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [uploadState, upload] = useActionState<ActionState, FormData>(uploadMedia, {});
  const [assignState, assign] = useActionState<ActionState, FormData>(assignMedia, {});
  const [deleteState, remove] = useActionState<ActionState, FormData>(deleteMedia, {});
  const [clearState, clear] = useActionState<ActionState, FormData>(assignMedia, {});
  const withPhotos = items.filter((item) => item.currentUrl);

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
          <div className="admin__field">
            <span className="admin__hint">
              Saved as WebP automatically, at most 2000px on the longest side, with smaller
              copies for phones.
            </span>
          </div>
        </div>

        <Submit label="Upload photo" />
      </form>

      <section className="build__card">
        <h3 className="build__step-subtitle">صورك · Your photos</h3>

        {deleteState.error ? (
          <p className="admin__message admin__message--error" role="alert">
            {deleteState.error}
          </p>
        ) : null}
        {deleteState.ok && deleteState.message ? (
          <p className="admin__message admin__message--ok" role="status">
            {deleteState.message}
          </p>
        ) : null}

        {images.length === 0 ? (
          <p className="admin__empty">Nothing uploaded yet.</p>
        ) : (
          <ul className="photo-library">
            {images.map((image) => (
              <li key={image.id} className="photo-library__item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt} loading="lazy" />
                <span className="photo-library__facts">{describe(image)}</span>
                <form
                  action={remove}
                  onSubmit={(event) => {
                    if (!window.confirm('حذف هذه الصورة نهائياً؟ ستُزال من أي طبق يستخدمها.\nDelete this photo? It is removed from any dish using it.')) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="mediaId" value={image.id} />
                  <DeleteButton />
                </form>
              </li>
            ))}
          </ul>
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

      {withPhotos.length > 0 ? (
        <section className="build__card">
          <h3 className="build__step-subtitle">صور الأطباق · Dishes with a photo</h3>

          {clearState.ok && clearState.message ? (
            <p className="admin__message admin__message--ok" role="status">
              {clearState.message}
            </p>
          ) : null}

          <ul className="photo-dishes">
            {withPhotos.map((item) => (
              <li key={item.code} className="photo-dishes__item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.currentUrl ?? ''} alt="" loading="lazy" />
                <span className="photo-dishes__name">{item.label}</span>
                <form action={clear}>
                  <input type="hidden" name="targetType" value="item" />
                  <input type="hidden" name="targetKey" value={item.code} />
                  <input type="hidden" name="mediaId" value="" />
                  <RemoveButton />
                </form>
              </li>
            ))}
          </ul>
          <p className="admin__hint">Removing takes the photo off the dish; the photo stays in your library.</p>
        </section>
      ) : null}
    </div>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="admin__button admin__button--secondary admin__button--small" disabled={pending}>
      {pending ? '…' : 'إزالة الصورة · Remove photo'}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="admin__button admin__button--danger admin__button--small" disabled={pending}>
      {pending ? '…' : 'حذف · Delete'}
    </button>
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
