'use client';

import { useEffect, useId, useRef, useState } from 'react';
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
  recommendedFor: readonly string[];
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
  previewPath,
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
  previewPath: string;
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
  const [state, setState] = useState<ActionState>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'failed'>('idle');
  // Counts successful saves. The preview is an iframe of the real page, so the
  // only way it can show a setting that lives in the saved row — typography,
  // density, photography, the display toggles — is to load again once the row
  // has changed. Keying on the result message alone left it stale from the
  // second save onward, because the message is identical every time.
  const [savedRevision, setSavedRevision] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const revisionRef = useRef(0);
  const [device, setDevice] = useState<(typeof DEVICES)[number]['key']>('mobile');
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');
  type DesignChoice = {
    themeKey: string; layoutKey: string;
    fontHeading: string; fontBody: string; fontPrice: string; fontAccent: string;
    imageStyle: string; density: string;
    showPrices: boolean; showImages: boolean; showCalories: boolean;
  };
  const [designHistory, setDesignHistory] = useState<{
    past: DesignChoice[];
    present: DesignChoice;
    future: DesignChoice[];
  }>({
    past: [],
    present: {
      themeKey: design.themeKey, layoutKey: design.layoutKey,
      fontHeading: design.fonts.heading ?? '', fontBody: design.fonts.body ?? '',
      fontPrice: design.fonts.price ?? '', fontAccent: design.fonts.accent ?? '',
      imageStyle: design.imageStyle ?? '', density: design.density ?? '',
      showPrices: design.showPrices, showImages: design.showImages,
      showCalories: design.showCalories,
    },
    future: [],
  });
  const choice = designHistory.present;
  const { themeKey, layoutKey } = choice;

  // A theme the operator is looking at but has not applied. Holding it in
  // component state, and passing it to the preview as a query parameter, is
  // what keeps browsing the library free of consequence: the preview route
  // re-resolves presentation for that one response and writes nothing, so no
  // MenuDesign row, menu version or QR destination moves until Apply.
  const [previewChoice, setPreviewChoice] = useState<{ themeKey: string; layoutKey: string } | null>(
    null,
  );
  const viewing = previewChoice ?? { themeKey, layoutKey };
  const previewingUnapplied =
    viewing.themeKey !== themeKey || viewing.layoutKey !== layoutKey;

  const frameId = useId();
  const active = DEVICES.find((entry) => entry.key === device)!;
  const theme = themes.find((entry) => entry.key === viewing.themeKey) ?? themes[0]!;

  const queueSave = (formData: FormData) => {
    const revision = ++revisionRef.current;
    setSaveStatus('saving');

    // Saves are deliberately serial. If an earlier request is slow it must
    // finish before the newer snapshot is sent, so it can never arrive last
    // and overwrite the operator's newest choice.
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const result = await updateDesignAction({}, formData);
        if (revision !== revisionRef.current) return;
        setState(result);
        setSaveStatus(result.ok ? 'saved' : 'failed');
        if (result.ok) setSavedRevision((current) => current + 1);
      })
      .catch((error: unknown) => {
        if (revision !== revisionRef.current) return;
        setState({ error: error instanceof Error ? error.message : 'Design could not be saved.' });
        setSaveStatus('failed');
      });
  };

  const scheduleAutosave = () => {
    setSaveStatus('dirty');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (formRef.current) queueSave(new FormData(formRef.current));
    }, 900);
  };

  const rememberDesign = (next: DesignChoice) => {
    setDesignHistory((current) => {
      if (JSON.stringify(current.present) === JSON.stringify(next)) return current;

      return {
        past: [...current.past.slice(-19), current.present],
        present: next,
        future: [],
      };
    });
  };

  const travelDesignHistory = (direction: 'undo' | 'redo') => {
    setDesignHistory((current) => {
      if (direction === 'undo') {
        const previous = current.past.at(-1);
        if (!previous) return current;
        return {
          past: current.past.slice(0, -1),
          present: previous,
          future: [current.present, ...current.future],
        };
      }

      const next = current.future[0];
      if (!next) return current;
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      };
    });

    // Programmatic state changes do not fire the form's onChange event. Wait
    // for React to put the travelled values into the controls, then persist
    // that snapshot through the same serialized autosave queue.
    setTimeout(scheduleAutosave, 0);
  };

  /** Commit the theme being previewed. Goes through history and the same
   *  serialized queue as every other design edit, so it is undoable. */
  const applyPreviewedTheme = () => {
    if (!previewChoice) return;
    rememberDesign({ ...choice, themeKey: previewChoice.themeKey, layoutKey: previewChoice.layoutKey });
    setPreviewChoice(null);
    setTimeout(scheduleAutosave, 0);
  };

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Reloads when the saved design changes, so the preview reflects the last
  // successful save rather than an optimistic guess.
  const previewSeparator = previewPath.includes('?') ? '&' : '?';
  const previewSrc = `${previewPath}${previewSeparator}lang=${locale}&theme=${encodeURIComponent(viewing.themeKey)}&layout=${encodeURIComponent(viewing.layoutKey)}&studio=${previewingUnapplied ? 'preview' : 'applied'}`;

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
            key={`${device}-${locale}-${savedRevision}`}
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

      <form
        ref={formRef}
        action={async (formData) => {
          await updateDesignAction({}, formData);
        }}
        onChange={scheduleAutosave}
        onSubmit={(event) => {
          event.preventDefault();
          if (debounceRef.current) clearTimeout(debounceRef.current);
          queueSave(new FormData(event.currentTarget));
        }}
        className="studio__pane studio__pane--design"
        aria-label="Design"
      >
        <h2 className="studio__pane-title">Design</h2>

        {state.error ? (
          <p className="admin__message admin__message--error" role="alert">
            {state.error}
          </p>
        ) : null}
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="menuId" value={menuId} />

        <div className="studio__history" role="group" aria-label="Design edit history">
          <button
            type="button"
            className="admin__button admin__button--secondary"
            disabled={designHistory.past.length === 0}
            onClick={() => travelDesignHistory('undo')}
          >
            Undo
          </button>
          <button
            type="button"
            className="admin__button admin__button--secondary"
            disabled={designHistory.future.length === 0}
            onClick={() => travelDesignHistory('redo')}
          >
            Redo
          </button>
          <span className="admin__hint">Last 20 design changes</span>
        </div>

        {/* The applied design. The library's radios are preview-only and
            deliberately carry a different name, so browsing never submits. */}
        <input type="hidden" name="themeKey" value={themeKey} />
        <input type="hidden" name="layoutKey" value={layoutKey} />

        <fieldset className="theme-library">
          <legend className="admin__label">Theme Library</legend>
          <p className="admin__hint">
            Every card is your own menu, with your own dishes and prices, drawn by the page a
            customer gets. Looking through them changes nothing — press Apply to keep one.
          </p>
          <div className="theme-library__grid" role="radiogroup" aria-label="Theme">
            {themes.map((entry) => {
              const isViewing = entry.key === viewing.themeKey;
              const isApplied = entry.key === themeKey;
              const cardLayout =
                (isViewing ? entry.layouts.find((l) => l.key === viewing.layoutKey) : null) ??
                entry.layouts[0]!;
              const cardSrc = `${previewPath}${previewSeparator}lang=${locale}&theme=${encodeURIComponent(entry.key)}&layout=${encodeURIComponent(cardLayout.key)}`;

              return (
                <label
                  className="theme-card"
                  data-theme={entry.key}
                  data-selected={isViewing ? '' : undefined}
                  data-applied={isApplied ? '' : undefined}
                  key={entry.key}
                >
                  <input
                    className="admin__visually-hidden"
                    type="radio"
                    name="themePreview"
                    value={entry.key}
                    // Without this the radio's accessible name is the whole
                    // card — heading, tone, description and variant count read
                    // out as one run-on string.
                    aria-label={`Preview the ${entry.label} theme`}
                    checked={isViewing}
                    onChange={(event) => {
                      // Never let a preview reach the autosave listener on the
                      // form: choosing a card must not write anything.
                      event.stopPropagation();
                      setPreviewChoice(
                        entry.key === themeKey
                          ? null
                          : { themeKey: entry.key, layoutKey: entry.layouts[0]!.key },
                      );
                    }}
                  />
                  <span className="theme-card__preview" aria-hidden="true">
                    <iframe src={cardSrc} title="" loading="lazy" tabIndex={-1} />
                  </span>
                  <span className="theme-card__head">
                    <strong>{entry.label}</strong>
                    <span className="theme-card__tone">{entry.tonePreference}</span>
                  </span>
                  <span className="theme-card__description">{entry.description}</span>
                  <span className="theme-card__meta">
                    {entry.recommendedFor.length > 0
                      ? `Best for ${entry.recommendedFor.join(', ')}`
                      : 'Flexible style'}{' '}
                    · {entry.layouts.length} variants
                  </span>
                  <span className="theme-card__action">
                    {isApplied && !previewingUnapplied
                      ? 'Applied'
                      : isViewing
                        ? 'Previewing'
                        : 'Preview'}
                  </span>
                </label>
              );
            })}
          </div>

          {previewingUnapplied ? (
            <div className="theme-library__apply" role="group" aria-label="Previewed theme">
              <p className="admin__hint" role="status" aria-live="polite">
                Previewing {theme.label}. Nothing has been saved.
              </p>
              <button type="button" className="admin__button" onClick={applyPreviewedTheme}>
                Apply {theme.label}
              </button>
              <button
                type="button"
                className="admin__button admin__button--secondary"
                onClick={() => setPreviewChoice(null)}
              >
                Keep current theme
              </button>
            </div>
          ) : null}
        </fieldset>

        <div className="admin__field">
          <label className="admin__label" htmlFor="studio-layout">
            Layout
          </label>
          <select
            id="studio-layout"
            className="admin__select"
            value={viewing.layoutKey}
            onChange={(event) => {
              // While a theme is only being previewed the variant is part of
              // that preview, not an edit to the applied design.
              if (previewChoice) {
                event.stopPropagation();
                setPreviewChoice({ ...previewChoice, layoutKey: event.target.value });
                return;
              }
              rememberDesign({ ...choice, layoutKey: event.target.value });
            }}
            key={viewing.themeKey}
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
              ['fontHeading', 'Heading', 'heading', choice.fontHeading],
              ['fontBody', 'Body', 'body', choice.fontBody],
              ['fontPrice', 'Price', 'price', choice.fontPrice],
              ['fontAccent', 'Accent', 'accent', choice.fontAccent],
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
                value={current}
                onChange={(event) => rememberDesign({ ...choice, [name]: event.target.value })}
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
            value={choice.imageStyle}
            onChange={(event) => rememberDesign({ ...choice, imageStyle: event.target.value })}
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
            value={choice.density}
            onChange={(event) => rememberDesign({ ...choice, density: event.target.value })}
          >
            <option value="">Theme default</option>
            <option value="compact">Compact</option>
            <option value="regular">Regular</option>
            <option value="airy">Airy</option>
          </select>
        </div>

        <fieldset className="admin__fieldset">
          <legend className="admin__label">Show</legend>
          <Toggle name="showPrices" label="Prices" checked={choice.showPrices} onChange={(checked) => rememberDesign({ ...choice, showPrices: checked })} />
          <Toggle name="showImages" label="Photographs" checked={choice.showImages} onChange={(checked) => rememberDesign({ ...choice, showImages: checked })} />
          <Toggle name="showCalories" label="Calories where entered" checked={choice.showCalories} onChange={(checked) => rememberDesign({ ...choice, showCalories: checked })} />
        </fieldset>

        <div className="admin__actions">
          {/* Autosave covers the ordinary case, but the operator keeps a way to
              force a write — and, after a failure, to try again without having
              to invent a change. The name stays stable so what a screen reader
              announces on focus does not shift under the pointer; the live
              region below is what reports progress. */}
          <button type="submit" className="admin__button" disabled={saveStatus === 'saving'}>
            {saveStatus === 'failed' ? 'Retry save' : 'Save now'}
          </button>
          <span
            className="admin__hint"
            role="status"
            aria-live="polite"
            data-save-state={saveStatus}
          >
            {saveStatus === 'dirty'
              ? 'Unsaved changes'
              : saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'saved'
                  ? 'Saved'
                  : saveStatus === 'failed'
                    ? 'Save failed. Retry when ready.'
                    : 'Draft autosave is on'}
          </span>
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
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <div className="admin__checkbox">
      <input id={id} name={name} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}
