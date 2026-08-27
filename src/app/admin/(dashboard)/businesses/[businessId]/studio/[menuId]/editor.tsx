'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { updateDesignAction } from '@/server/admin/studio-actions';
import { fontsForRole } from '@/menu-studio/typography';
import type { ActionState } from '@/server/admin/actions';

/**
 * The three-pane editor (Menu Studio §17, §18).
 *
 * The centre pane is an iframe of the real public profile at a chosen device
 * width. Device preview is a width and a locale, not a simulator: the page
 * inside is the page a visitor loads, so if it breaks at 360px it breaks here.
 *
 * The design pane is a plain form. It submits and the preview reloads — no
 * drag-and-drop is required to change anything, which is what keeps the studio
 * usable on a tablet and with a keyboard (§16).
 */

type Item = {
  id: string;
  code: string;
  name: string;
  price: number | null;
  calories: number | null;
  tags: string[];
  availability: string;
  hasImage: boolean;
  margin: { ratio: number; band: 'low' | 'healthy' | 'high' } | null;
};

type Category = { id: string; key: string; name: string; items: Item[] };
type ParentCategory = Category & { children: Category[] };

interface ThemeOption {
  key: string;
  label: string;
  description: string;
  tonePreference: string;
  layouts: { key: string; label: string; description: string }[];
}

const DEVICES = [
  { key: 'mobile', label: 'Mobile', width: 390, height: 780 },
  { key: 'tablet', label: 'Tablet', width: 834, height: 900 },
  { key: 'desktop', label: 'Desktop', width: 1280, height: 900 },
  // Print is a real page width at print proportions; the public stylesheet
  // carries the print rules, so this shows the same thing a printer would.
  { key: 'print', label: 'Print', width: 794, height: 1123 },
] as const;

export function StudioEditor({
  businessId,
  menuId,
  publicPath,
  design,
  themes,
  structure,
  orphans,
  costSummary,
  currency,
}: {
  businessId: string;
  menuId: string;
  publicPath: string;
  design: {
    themeKey: string;
    layoutKey: string;
    fonts: { heading: string | null; body: string | null; price: string | null; accent: string | null };
    imageStyle: string | null;
    density: string | null;
    showPrices: boolean;
    showImages: boolean;
    showCalories: boolean;
  };
  themes: ThemeOption[];
  structure: ParentCategory[];
  orphans: { id: string; key: string; name: string }[];
  costSummary: { covered: number; total: number; averageRatio: number | null };
  currency: string;
}) {
  const [state, save] = useActionState<ActionState, FormData>(updateDesignAction, {});
  const [device, setDevice] = useState<(typeof DEVICES)[number]['key']>('mobile');
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');
  const [themeKey, setThemeKey] = useState(design.themeKey);

  const frameId = useId();
  const active = DEVICES.find((entry) => entry.key === device)!;
  const theme = themes.find((entry) => entry.key === themeKey) ?? themes[0]!;

  // Reloads when the saved design changes, so the preview reflects the last
  // successful save rather than an optimistic guess.
  const previewSrc = `${publicPath}?lang=${locale}&studio=${state.ok ? 'saved' : 'draft'}`;

  return (
    <div className="studio">
      <section className="studio__pane studio__pane--structure" aria-label="Menu structure">
        <h2 className="studio__pane-title">Structure</h2>

        {structure.length === 0 ? (
          <p className="admin__empty">This menu has no categories yet.</p>
        ) : (
          <ol className="studio__tree">
            {structure.map((category) => (
              <li key={category.id}>
                <CategoryNode category={category} currency={currency} />
                {category.children.length > 0 ? (
                  <ol className="studio__tree studio__tree--nested">
                    {category.children.map((child) => (
                      <li key={child.id}>
                        <CategoryNode category={child} currency={currency} />
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        {orphans.length > 0 ? (
          <p className="admin__message admin__message--error" role="status">
            {orphans.length} subcategories point at a category that no longer exists:{' '}
            {orphans.map((entry) => entry.key).join(', ')}.
          </p>
        ) : null}

        <p className="admin__hint">
          {costSummary.covered === 0
            ? 'No food costs entered, so no margins are shown.'
            : `Margins shown for ${costSummary.covered} of ${costSummary.total} items — the rest have no cost entered.`}
        </p>
      </section>

      <section className="studio__pane studio__pane--preview" aria-label="Live preview">
        <div className="studio__toolbar">
          <div className="studio__device-switch" role="group" aria-label="Device">
            {DEVICES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className="studio__device"
                aria-pressed={device === entry.key}
                onClick={() => setDevice(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="studio__device-switch" role="group" aria-label="Language">
            <button
              type="button"
              className="studio__device"
              aria-pressed={locale === 'ar'}
              onClick={() => setLocale('ar')}
            >
              العربية
            </button>
            <button
              type="button"
              className="studio__device"
              aria-pressed={locale === 'en'}
              onClick={() => setLocale('en')}
            >
              English
            </button>
          </div>

          <a href={`${publicPath}?lang=${locale}`} target="_blank" rel="noreferrer" className="studio__open">
            Open in a tab
          </a>
        </div>

        <div className={`studio__frame studio__frame--${device}`}>
          <iframe
            key={`${device}-${locale}-${state.message ?? ''}`}
            id={frameId}
            title="Live menu preview"
            src={previewSrc}
            width={active.width}
            height={active.height}
            className="studio__iframe"
          />
        </div>

        <p className="admin__hint">
          {active.width}×{active.height}. This is the real public page, not a mock-up.
        </p>
      </section>

      <form action={save} className="studio__pane studio__pane--design" aria-label="Design">
        <h2 className="studio__pane-title">Design</h2>

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
        <input type="hidden" name="menuId" value={menuId} />

        <div className="admin__field">
          <label className="admin__label" htmlFor="studio-theme">
            Theme
          </label>
          <select
            id="studio-theme"
            name="themeKey"
            className="admin__select"
            value={themeKey}
            onChange={(event) => setThemeKey(event.target.value)}
          >
            {themes.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
          <span className="admin__hint">{theme.description}</span>
        </div>

        <div className="admin__field">
          <label className="admin__label" htmlFor="studio-layout">
            Layout
          </label>
          <select
            id="studio-layout"
            name="layoutKey"
            className="admin__select"
            defaultValue={theme.key === design.themeKey ? design.layoutKey : 'a'}
            key={theme.key}
          >
            {theme.layouts.map((layout) => (
              <option key={layout.key} value={layout.key}>
                {layout.label} — {layout.description}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="admin__fieldset">
          <legend className="admin__label">Typography</legend>
          {(
            [
              ['fontHeading', 'Heading', 'heading', design.fonts.heading],
              ['fontBody', 'Body', 'body', design.fonts.body],
              ['fontPrice', 'Price', 'price', design.fonts.price],
              ['fontAccent', 'Accent', 'accent', design.fonts.accent],
            ] as const
          ).map(([name, label, role, current]) => (
            <div className="admin__field" key={name}>
              <label className="admin__label" htmlFor={`studio-${name}`}>
                {label}
              </label>
              <select
                id={`studio-${name}`}
                name={name}
                className="admin__select"
                defaultValue={current ?? ''}
              >
                <option value="">Theme default</option>
                {fontsForRole(role).map((face) => (
                  <option key={face.key} value={face.key}>
                    {face.label}
                    {face.scripts.includes('arabic') ? '' : ' — Latin only'}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <p className="admin__hint">
            A Latin-only face renders Arabic in a fallback. Arabic is the primary language, so
            prefer a face that covers it.
          </p>
        </fieldset>

        <div className="admin__field">
          <label className="admin__label" htmlFor="studio-image-style">
            Photography
          </label>
          <select
            id="studio-image-style"
            name="imageStyle"
            className="admin__select"
            defaultValue={design.imageStyle ?? ''}
          >
            <option value="">Theme default</option>
            {['none', 'thumbnail', 'rounded', 'circle', 'editorial', 'full-bleed', 'polaroid', 'floating', 'grid'].map(
              (style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ),
            )}
          </select>
        </div>

        <div className="admin__field">
          <label className="admin__label" htmlFor="studio-density">
            Density
          </label>
          <select
            id="studio-density"
            name="density"
            className="admin__select"
            defaultValue={design.density ?? ''}
          >
            <option value="">Theme default</option>
            <option value="compact">Compact</option>
            <option value="regular">Regular</option>
            <option value="airy">Airy</option>
          </select>
        </div>

        <fieldset className="admin__fieldset">
          <legend className="admin__label">Show</legend>
          <Toggle name="showPrices" label="Prices" defaultChecked={design.showPrices} />
          <Toggle name="showImages" label="Photographs" defaultChecked={design.showImages} />
          <Toggle name="showCalories" label="Calories where entered" defaultChecked={design.showCalories} />
        </fieldset>

        <div className="admin__actions">
          <SaveButton />
        </div>

        <p className="admin__hint">
          Design changes never touch menu content: items, prices, descriptions, photographs and
          modifiers are unaffected by anything on this pane.
        </p>
      </form>
    </div>
  );
}

function CategoryNode({ category, currency }: { category: Category; currency: string }) {
  return (
    <>
      <p className="studio__category">
        <span className="studio__category-name">{category.name}</span>
        <span className="studio__category-count">{category.items.length}</span>
      </p>
      <ul className="studio__items">
        {category.items.map((item) => (
          <li key={item.id} className="studio__item">
            <span className="studio__item-name">{item.name}</span>
            <span className="studio__item-meta">
              {item.price === null ? (
                <span className="studio__item-flag">no price</span>
              ) : (
                <span>
                  {(item.price / 100).toFixed(2)} {currency}
                </span>
              )}
              {item.hasImage ? null : <span className="studio__item-flag">no photo</span>}
              {item.availability !== 'AVAILABLE' ? (
                <span className="studio__item-flag">{item.availability.toLowerCase()}</span>
              ) : null}
              {item.margin ? (
                <span className={`studio__margin studio__margin--${item.margin.band}`}>
                  {Math.round(item.margin.ratio * 100)}%
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  const id = useId();

  return (
    <div className="admin__checkbox">
      <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="admin__button" disabled={pending}>
      {pending ? 'Saving…' : 'Save design'}
    </button>
  );
}
