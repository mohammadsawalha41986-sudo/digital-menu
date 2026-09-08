'use client';

import { useState } from 'react';
import { ActionForm, Field, SelectField, TextField } from '../../../components';
import type { ActionState } from '@/server/admin/actions';

const KIND_OPTIONS = [
  { value: 'ITEM_IMAGE', label: 'Item image' },
  { value: 'CATEGORY_IMAGE', label: 'Category image' },
  { value: 'OFFER_IMAGE', label: 'Offer image' },
  { value: 'LOGO', label: 'Logo' },
  { value: 'OG_IMAGE', label: 'Share image' },
  { value: 'GALLERY', label: 'Gallery' },
];

/**
 * Adds an image that already lives somewhere else.
 *
 * The preview is the point. Nothing is fetched server-side — the server
 * refuses to follow a pasted address — so the browser loading the image *is*
 * the check that the URL is real, and the operator sees the same thing a
 * visitor will. A URL that will not load is visibly wrong before it is saved.
 */
export function LinkImageForm({
  action,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'failed'>('idle');
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const trimmed = url.trim();
  const looksAbsolute = /^https?:\/\//i.test(trimmed);

  return (
    <section className="admin__panel">
      <h2 className="admin__panel-title">Add an image by URL</h2>
      <p className="admin__hint">
        For photography that already lives on a CDN or another site. Nothing is copied —
        the menu links straight to it, so it must stay reachable.
      </p>

      <ActionForm action={action} submitLabel="Add image">
        {/* Controlled, unlike `TextField`, because the preview below follows
            what is typed. Same markup and classes, so it looks identical. */}
        <Field label="Image URL" hint="Must start with http:// or https://">
          {(id) => (
            <input
              id={id}
              name="url"
              type="url"
              dir="ltr"
              className="admin__input"
              placeholder="https://cdn.example.com/dish.jpg"
              required
              value={url}
              onChange={(event) => {
                const next = event.target.value;
                setUrl(next);
                setSize(null);
                setState(/^https?:\/\//i.test(next.trim()) ? 'loading' : 'idle');
              }}
            />
          )}
        </Field>

        {/* Intrinsic dimensions travel with the form so the public page can
            reserve the right box and not shift as the image arrives. */}
        <input type="hidden" name="width" value={size?.width ?? ''} />
        <input type="hidden" name="height" value={size?.height ?? ''} />

        {looksAbsolute ? (
          <Field label="Preview">
            {() => (
              <div className="admin__url-preview" data-state={state}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={trimmed}
                  alt=""
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    setSize({ width: img.naturalWidth, height: img.naturalHeight });
                    setState('ok');
                  }}
                  onError={() => {
                    setSize(null);
                    setState('failed');
                  }}
                />
                <p className="admin__hint" role="status">
                  {state === 'failed'
                    ? 'That image could not be loaded. Check the URL is public and points at an image.'
                    : state === 'ok'
                      ? `Loaded${size ? ` · ${size.width}×${size.height}` : ''}`
                      : 'Loading…'}
                </p>
              </div>
            )}
          </Field>
        ) : null}

        <div className="admin__grid">
          <SelectField name="kind" label="Kind" defaultValue="ITEM_IMAGE" options={KIND_OPTIONS} />
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
  );
}
