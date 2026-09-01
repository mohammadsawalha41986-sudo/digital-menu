'use client';

import { useActionState, useState } from 'react';
import type { ActionState } from '@/server/admin/actions';

/**
 * The focal point picker (master spec §46, §47).
 *
 * Click the image where the subject is. That point is stored on the medium and
 * every template crops around it, which is how one upload serves a 1:1 tile, a
 * 4:5 card and a 16:9 hero without the operator uploading three versions (§48).
 *
 * The preview shows the same crop the templates will apply, because the whole
 * value of setting a focal point is seeing what it saves. Presets exist beside
 * it: most images want "top" or "centre", and clicking a preset is faster than
 * aiming.
 */
export function FocalEditor({
  url,
  alt,
  focalX,
  focalY,
  action,
}: {
  url: string;
  alt: string;
  focalX: number | null;
  focalY: number | null;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [point, setPoint] = useState({ x: focalX ?? 0.5, y: focalY ?? 0.5 });

  const position = `${(point.x * 100).toFixed(1)}% ${(point.y * 100).toFixed(1)}%`;

  return (
    <form action={formAction} className="admin__form" data-focal-editor="">
      {state.error ? (
        <p className="admin__message admin__message--error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="admin__message admin__message--ok" role="status">
          {state.message}
        </p>
      ) : null}

      <div className="focal">
        <button
          type="button"
          className="focal__canvas"
          aria-label="Click where the subject of this image is"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setPoint({
              x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
              y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
            });
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="focal__image" />
          <span
            className="focal__marker"
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
            aria-hidden="true"
          />
        </button>

        <div className="focal__previews">
          {[
            { ratio: '1 / 1', label: 'Square' },
            { ratio: '4 / 5', label: 'Portrait' },
            { ratio: '16 / 9', label: 'Wide' },
          ].map((preview) => (
            <figure key={preview.label} className="focal__preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                style={{ aspectRatio: preview.ratio, objectPosition: position }}
              />
              <figcaption>{preview.label}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      <input type="hidden" name="focalX" value={point.x} />
      <input type="hidden" name="focalY" value={point.y} />

      <div className="admin__actions">
        <button type="submit" className="admin__button">
          Save focal point
        </button>
        {(['centre', 'top', 'bottom', 'left', 'right'] as const).map((preset) => (
          <button
            key={preset}
            type="submit"
            name="preset"
            value={preset}
            className="admin__button admin__button--secondary"
          >
            {preset[0]!.toUpperCase() + preset.slice(1)}
          </button>
        ))}
        <button
          type="submit"
          name="preset"
          value="clear"
          className="admin__button admin__button--secondary"
        >
          Clear
        </button>
      </div>
    </form>
  );
}
