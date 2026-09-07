'use client';

import { ActionButton, ActionForm, Field, SelectField, TextField } from '../../../components';
import type { ActionState } from '@/server/admin/actions';
import { FocalEditor } from './focal-editor';

interface MediaRow {
  id: string;
  kind: string;
  url: string;
  altAr: string | null;
  altEn: string | null;
  originalName: string | null;
  sizeKb: number;
  width: number | null;
  height: number | null;
  focalX: number | null;
  focalY: number | null;
  derivativeWidths: number[];
  quality: { level: 'GOOD' | 'FAIR' | 'POOR'; notes: string[] } | null;
}

export function MediaLibrary({
  businessId,
  publicId,
  media,
  itemCodes,
  categoryKeys,
  uploadMedia,
  assignMedia,
  deleteMedia,
  setFocalPoint,
  setAltText,
  optimiseAll,
}: {
  businessId: string;
  publicId: string;
  media: MediaRow[];
  itemCodes: string[];
  categoryKeys: string[];
  uploadMedia: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  assignMedia: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  deleteMedia: (businessId: string, mediaId: string, publicId: string) => Promise<ActionState>;
  setFocalPoint: (
    businessId: string,
    publicId: string,
    mediaId: string,
    previous: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  setAltText: (
    businessId: string,
    publicId: string,
    mediaId: string,
    previous: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  optimiseAll: (businessId: string, publicId: string) => Promise<ActionState>;
}) {
  return (
    <>
      <section className="admin__panel">
        <h2 className="admin__panel-title">Upload an image</h2>
        <p className="admin__hint">
          JPEG, PNG or WebP, up to 8MB. Identical files are reused rather than stored twice.
        </p>
        <ActionForm action={uploadMedia} submitLabel="Upload">
          <Field label="Image">
            {(id) => (
              <input
                id={id}
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="admin__input"
                required
              />
            )}
          </Field>
          <div className="admin__grid">
            <SelectField
              name="kind"
              label="Kind"
              defaultValue="ITEM_IMAGE"
              options={[
                { value: 'ITEM_IMAGE', label: 'Item image' },
                { value: 'CATEGORY_IMAGE', label: 'Category image' },
                { value: 'OFFER_IMAGE', label: 'Offer image' },
                { value: 'LOGO', label: 'Logo' },
                { value: 'OG_IMAGE', label: 'Share image' },
                { value: 'GALLERY', label: 'Gallery' },
              ]}
            />
            <TextField
              name="altAr"
              label="Alt text (Arabic)"
              dir="rtl"
              hint="Describes the image for screen readers."
            />
            <TextField name="altEn" label="Alt text (English)" />
          </div>
        </ActionForm>
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Assign an image</h2>
        <ActionForm action={assignMedia} submitLabel="Assign">
          <div className="admin__grid">
            <SelectField
              name="mediaId"
              label="Image"
              options={[
                { value: '', label: '— none (clear the assignment) —' },
                ...media.map((entry) => ({
                  value: entry.id,
                  label: entry.originalName ?? entry.id,
                })),
              ]}
            />
            <SelectField
              name="targetType"
              label="Assign to"
              defaultValue="item"
              options={[
                { value: 'item', label: 'Menu item' },
                { value: 'category', label: 'Category' },
                { value: 'offer', label: 'Offer' },
                { value: 'business-logo', label: 'Business logo' },
                { value: 'business-og', label: 'Share image' },
              ]}
            />
            <TextField
              name="targetKey"
              label="Item code / category key / offer key"
              hint={
                itemCodes.length > 0
                  ? `Items: ${itemCodes.slice(0, 6).join(', ')}${itemCodes.length > 6 ? '…' : ''}`
                  : 'Not needed for logo or share image.'
              }
            />
          </div>
          {categoryKeys.length > 0 ? (
            <p className="admin__hint">Categories: {categoryKeys.join(', ')}</p>
          ) : null}
        </ActionForm>
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Library</h2>
        <div className="admin__actions">
          <ActionButton
            action={optimiseAll.bind(null, businessId, publicId)}
            label="Generate smaller versions"
            pendingLabel="Optimising…"
          />
          <span className="admin__hint">
            Images uploaded from now on are optimised automatically. This catches up on
            anything uploaded earlier — twenty at a time.
          </span>
        </div>

        {media.length === 0 ? (
          <p className="admin__empty">No images yet.</p>
        ) : (
          <div className="admin__qr-grid">
            {media.map((entry) => (
              <figure className="admin__qr-preview" key={entry.id} data-media={entry.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={entry.url} alt={entry.altEn ?? entry.altAr ?? ''} loading="lazy" />
                <figcaption className="admin__hint">
                  {entry.originalName ?? entry.id} · {entry.kind} · {entry.sizeKb} KB
                  {entry.width && entry.height ? ` · ${entry.width}×${entry.height}` : ''}
                  {entry.derivativeWidths.length > 0
                    ? ` · ${entry.derivativeWidths.length} smaller versions`
                    : ' · not optimised'}
                  {entry.altAr || entry.altEn ? '' : ' · no alt text'}
                </figcaption>

                {entry.quality ? (
                  <p
                    className={`admin__message admin__message--${
                      entry.quality.level === 'POOR'
                        ? 'error'
                        : entry.quality.level === 'FAIR'
                          ? 'warn'
                          : 'ok'
                    }`}
                    data-quality={entry.quality.level}
                  >
                    {entry.quality.notes.join(' ')}
                  </p>
                ) : null}

                <details>
                  <summary className="admin__label">Focal point</summary>
                  <FocalEditor
                    url={entry.url}
                    alt={entry.altEn ?? entry.altAr ?? ''}
                    focalX={entry.focalX}
                    focalY={entry.focalY}
                    action={setFocalPoint.bind(null, businessId, publicId, entry.id)}
                  />
                </details>

                <details>
                  <summary className="admin__label">Alt text</summary>
                  <ActionForm
                    action={setAltText.bind(null, businessId, publicId, entry.id)}
                    submitLabel="Save alt text"
                  >
                    <TextField
                      name="altAr"
                      label="Arabic"
                      defaultValue={entry.altAr}
                      dir="rtl"
                      hint="What the image shows, for a visitor who cannot see it."
                    />
                    <TextField name="altEn" label="English" defaultValue={entry.altEn} dir="ltr" />
                  </ActionForm>
                </details>

                <ActionButton
                  action={deleteMedia.bind(null, businessId, entry.id, publicId)}
                  label="Remove"
                  variant="danger"
                  confirm="Remove this image and clear every reference to it?"
                />
              </figure>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
