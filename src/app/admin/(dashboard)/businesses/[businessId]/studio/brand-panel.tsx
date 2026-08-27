'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  analyseLogoAction,
  applyBrandAction,
  overrideBrandAction,
} from '@/server/admin/studio-actions';
import { fontsForRole } from '@/menu-studio/typography';
import type { ActionState } from '@/server/admin/actions';
import type { BrandPresetView } from '@/server/brand/service';

/**
 * Brand identity (Menu Studio §6, §8, §31).
 *
 * The panel shows the measurement and the decision separately: analysing a
 * logo fills this in, and nothing on a customer's menu changes until "Apply to
 * the live menu" is pressed. Extracted swatches are shown beside the derived
 * palette so an operator can see where each colour came from — and every one
 * of them can be overridden (§8).
 */

interface Image {
  id: string;
  url: string;
  altEn: string | null;
  altAr: string | null;
}

function Submit({ label, className = 'admin__button' }: { label: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? `${label}…` : label}
    </button>
  );
}

function Result({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p className="admin__message admin__message--error" role="alert">
        {state.error}
      </p>
    );
  }

  if (state.ok && state.message) {
    return (
      <p className="admin__message admin__message--ok" role="status">
        {state.message}
      </p>
    );
  }

  return null;
}

export function BrandIdentityPanel({
  businessId,
  preset,
  images,
  suggestions,
}: {
  businessId: string;
  preset: BrandPresetView | null;
  images: Image[];
  suggestions: { key: string; label: string; reason: string }[];
}) {
  const [analyseState, analyse] = useActionState<ActionState, FormData>(analyseLogoAction, {});
  const [overrideState, override] = useActionState<ActionState, FormData>(overrideBrandAction, {});
  const [applyState, apply] = useActionState<ActionState, FormData>(applyBrandAction, {});

  return (
    <section className="admin__panel">
      <h2 className="admin__panel-title">Brand identity</h2>
      <p className="admin__hint">
        The menu wears the restaurant&rsquo;s colours, taken from its logo. Analysing measures the
        image; nothing a visitor sees changes until you apply it.
      </p>

      <form action={analyse} className="admin__form">
        <Result state={analyseState} />

        {images.length === 0 ? (
          <p className="admin__empty">
            Upload a logo to the media library first — the identity is measured from the actual
            image.
          </p>
        ) : (
          <>
            <input type="hidden" name="businessId" value={businessId} />
            <div className="admin__field">
              <label className="admin__label" htmlFor="brand-logo">
                Logo
              </label>
              <select
                id="brand-logo"
                name="mediaId"
                className="admin__select"
                defaultValue={preset?.logoMediaId ?? images[0]?.id}
              >
                {images.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.altEn ?? image.altAr ?? image.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin__actions">
              <Submit label="Analyse logo" />
            </div>
          </>
        )}
      </form>

      {preset ? (
        <>
          {!preset.fromLogo ? (
            <p className="admin__message admin__message--error" role="status">
              These colours are platform defaults — nothing could be measured from the image. Set
              them by hand below.
            </p>
          ) : null}

          <div className="studio__identity">
            <div>
              <h3 className="studio__subhead">Measured from the logo</h3>
              {preset.extractedColors.length === 0 ? (
                <p className="admin__hint">No swatches.</p>
              ) : (
                <ul className="studio__swatches">
                  {preset.extractedColors.map((colour) => (
                    <li key={colour}>
                      <span
                        className="studio__swatch"
                        style={{ background: colour }}
                        aria-hidden="true"
                      />
                      <code>{colour}</code>
                    </li>
                  ))}
                </ul>
              )}

              <h3 className="studio__subhead">Visual mood</h3>
              <p>
                {preset.mood.length > 0
                  ? `${preset.mood.join(', ')} · reads best on a ${preset.tone} page`
                  : 'Nothing conclusive was measured, so no mood is claimed.'}
              </p>

              {suggestions.length > 0 ? (
                <>
                  <h3 className="studio__subhead">Suggested themes</h3>
                  <ul className="studio__suggestions">
                    {suggestions.map((suggestion) => (
                      <li key={suggestion.key}>
                        <strong>{suggestion.label}</strong>
                        <span>{suggestion.reason}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="admin__hint">
                    Suggestions only. Pick the theme yourself in each menu.
                  </p>
                </>
              ) : null}
            </div>

            <div>
              <h3 className="studio__subhead">Brand palette</h3>
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

              {preset.manualOverrides.length > 0 ? (
                <p className="admin__hint">
                  Changed by hand: {preset.manualOverrides.join(', ')}.
                </p>
              ) : null}
            </div>
          </div>

          <form action={override} className="admin__form">
            <Result state={overrideState} />
            <input type="hidden" name="businessId" value={businessId} />

            <h3 className="studio__subhead">Override</h3>
            <p className="admin__hint">
              Changing a colour re-derives the background, text and border around it, so the menu
              stays readable.
            </p>

            <div className="admin__grid">
              <div className="admin__field">
                <label className="admin__label" htmlFor="brand-primary">
                  Primary
                </label>
                <input
                  id="brand-primary"
                  name="primary"
                  type="color"
                  defaultValue={preset.palette.primary}
                  className="admin__input"
                />
              </div>
              <div className="admin__field">
                <label className="admin__label" htmlFor="brand-secondary">
                  Secondary
                </label>
                <input
                  id="brand-secondary"
                  name="secondary"
                  type="color"
                  defaultValue={preset.palette.secondary}
                  className="admin__input"
                />
              </div>
              <div className="admin__field">
                <label className="admin__label" htmlFor="brand-accent">
                  Accent
                </label>
                <input
                  id="brand-accent"
                  name="accent"
                  type="color"
                  defaultValue={preset.palette.accent}
                  className="admin__input"
                />
              </div>
              <div className="admin__field">
                <label className="admin__label" htmlFor="brand-tone">
                  Page tone
                </label>
                <select
                  id="brand-tone"
                  name="tone"
                  className="admin__select"
                  defaultValue={preset.tone}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>

            <div className="admin__grid">
              {(
                [
                  ['fontHeading', 'Heading font', 'heading', preset.fonts.heading],
                  ['fontBody', 'Body font', 'body', preset.fonts.body],
                  ['fontPrice', 'Price font', 'price', preset.fonts.price],
                  ['fontAccent', 'Accent font', 'accent', preset.fonts.accent],
                ] as const
              ).map(([name, label, role, current]) => (
                <div className="admin__field" key={name}>
                  <label className="admin__label" htmlFor={`brand-${name}`}>
                    {label}
                  </label>
                  <select
                    id={`brand-${name}`}
                    name={name}
                    className="admin__select"
                    defaultValue={current}
                  >
                    {fontsForRole(role).map((face) => (
                      <option key={face.key} value={face.key}>
                        {face.label}
                        {face.scripts.includes('arabic') ? '' : ' — Latin only'}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="admin__actions">
              <Submit label="Save identity" className="admin__button admin__button--secondary" />
            </div>
          </form>

          <form action={apply} className="admin__form">
            <Result state={applyState} />
            <input type="hidden" name="businessId" value={businessId} />
            <div className="admin__actions">
              <Submit label="Apply to the live menu" />
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}
