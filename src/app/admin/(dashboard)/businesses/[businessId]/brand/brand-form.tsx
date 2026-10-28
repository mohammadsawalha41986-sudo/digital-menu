'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import { ActionForm, Field, SelectField } from '../../../components';
import type { ActionState } from '@/server/admin/actions';

/* Platform defaults — editors see these when no row exists. The three
 * "warm identity" presets below carry curated palettes operators can seed
 * from with one click; they stay as suggestions and never apply silently. */

const COLOR_FIELDS = [
  { key: 'colorPrimary', label: 'Primary', fallback: '#1F2421', hint: 'Main accent — buttons, dock' },
  { key: 'colorSecondary', label: 'Secondary', fallback: '#49A078', hint: 'Supporting tone' },
  { key: 'colorAccent', label: 'Accent', fallback: '#C9A227', hint: 'CTA, highlights' },
  { key: 'colorBackground', label: 'Background', fallback: '#FBF9F5', hint: 'Page canvas' },
  { key: 'colorSurface', label: 'Surface', fallback: '#FFFFFF', hint: 'Cards, bars' },
  { key: 'colorText', label: 'Text', fallback: '#16181A', hint: 'Body text' },
  { key: 'colorMuted', label: 'Muted text', fallback: '#6B7280', hint: 'Captions, hints' },
  { key: 'colorBorder', label: 'Border', fallback: '#E5E1D8', hint: 'Dividers, outlines' },
] as const;

type ColorKey = (typeof COLOR_FIELDS)[number]['key'];

const FONTS = [
  { value: 'system-serif', label: 'Serif' },
  { value: 'system-sans', label: 'Sans' },
  { value: 'system-mono', label: 'Mono' },
];

const RADIUS = [
  { value: 'none', label: 'Square' },
  { value: 'sm', label: 'Subtle' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Rounded' },
];

const PRESETS: ReadonlyArray<{ label: string; description: string; values: Record<ColorKey, string> }> = [
  {
    label: 'Warm charcoal',
    description: 'Dark primary, gold accent, cream canvas — reads as premium shawarma or BBQ.',
    values: {
      colorPrimary: '#2B1810',
      colorSecondary: '#8B4513',
      colorAccent: '#D4A017',
      colorBackground: '#FBF6ED',
      colorSurface: '#FFFFFF',
      colorText: '#1A0F08',
      colorMuted: '#7A6050',
      colorBorder: '#E8DCC8',
    },
  },
  {
    label: 'Fresh green',
    description: 'Olive primary with a soft cream — reads as healthy, Levantine.',
    values: {
      colorPrimary: '#2E5339',
      colorSecondary: '#5A7A4F',
      colorAccent: '#C9A227',
      colorBackground: '#F6F3E7',
      colorSurface: '#FFFFFF',
      colorText: '#14201A',
      colorMuted: '#637362',
      colorBorder: '#D9D8C6',
    },
  },
  {
    label: 'Deep red',
    description: 'Classic restaurant red with gold accents — reads as grilled, hearty, carnivorous.',
    values: {
      colorPrimary: '#8B1E1E',
      colorSecondary: '#4A1818',
      colorAccent: '#E6B33A',
      colorBackground: '#FBF3EB',
      colorSurface: '#FFFFFF',
      colorText: '#1A0E0C',
      colorMuted: '#6B4D4A',
      colorBorder: '#E9D9C9',
    },
  },
];

export interface BrandValues {
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  colorBackground: string;
  colorSurface: string;
  colorText: string;
  colorMuted: string;
  colorBorder: string;
  fontHeading: string;
  fontBody: string;
  radiusScale: string;
}

/* --- Contrast estimate (WCAG) --------------------------------------------
 * A quick ratio check so an operator sees when their chosen text colour is
 * unreadable on their chosen background. The number is advisory and the
 * calculation is approximate — real audits run through design-qa. */

function luminance(hex: string): number {
  const n = hex.replace('#', '');
  if (n.length !== 6) return 0;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const t = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * t(r) + 0.7152 * t(g) + 0.0722 * t(b);
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const bright = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (bright + 0.05) / (dark + 0.05);
}

/**
 * Brand editor — the *theme* half of template/theme separation (GOALS I6).
 *
 * Each colour comes with a live swatch; the preview panel renders a scaled
 * mock of the public profile using exactly the `--brand-*` tokens that will
 * reach it, so an operator sees the outcome before saving. A WCAG estimate
 * flags unreadable text/background combinations.
 */
export function BrandForm({
  brand,
  action,
}: {
  brand: Partial<BrandValues> | null;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const initial: Record<ColorKey, string> = useMemo(() => {
    const out: Record<string, string> = {};
    for (const field of COLOR_FIELDS) {
      out[field.key] = brand?.[field.key] ?? field.fallback;
    }
    return out as Record<ColorKey, string>;
  }, [brand]);

  const [values, setValues] = useState<Record<ColorKey, string>>(initial);

  const onColorChange = (key: ColorKey) => (event: ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setValues(preset.values);
  };

  const textOnBg = contrastRatio(values.colorText, values.colorBackground);
  const textOnSurface = contrastRatio(values.colorText, values.colorSurface);
  const primaryOnSurface = contrastRatio(values.colorPrimary, values.colorSurface);

  const previewStyle: Record<string, string> = {
    '--preview-primary': values.colorPrimary,
    '--preview-secondary': values.colorSecondary,
    '--preview-accent': values.colorAccent,
    '--preview-background': values.colorBackground,
    '--preview-surface': values.colorSurface,
    '--preview-text': values.colorText,
    '--preview-muted': values.colorMuted,
    '--preview-border': values.colorBorder,
  };

  return (
    <div className="brand-editor">
      <ActionForm action={action} submitLabel="Save brand">
        <div className="brand-editor__presets">
          <p className="brand-editor__presets-title">Start from a preset — nothing saves until you press Save.</p>
          <div className="brand-editor__preset-row">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="brand-editor__preset"
                onClick={() => applyPreset(preset)}
                title={preset.description}
              >
                <span className="brand-editor__preset-swatches" aria-hidden="true">
                  <span style={{ background: preset.values.colorPrimary }} />
                  <span style={{ background: preset.values.colorAccent }} />
                  <span style={{ background: preset.values.colorBackground }} />
                </span>
                <span className="brand-editor__preset-label">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="admin__grid">
          {COLOR_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint}>
              {(id) => (
                <div className="brand-editor__color-row">
                  <input
                    id={id}
                    name={field.key}
                    type="color"
                    value={values[field.key]}
                    onChange={onColorChange(field.key)}
                    className="admin__input brand-editor__color-input"
                  />
                  <code className="brand-editor__color-code">{values[field.key].toUpperCase()}</code>
                </div>
              )}
            </Field>
          ))}
        </div>

        <div className="admin__grid">
          <SelectField
            name="fontHeading"
            label="Heading type"
            defaultValue={brand?.fontHeading ?? 'system-serif'}
            options={FONTS}
          />
          <SelectField
            name="fontBody"
            label="Body type"
            defaultValue={brand?.fontBody ?? 'system-sans'}
            options={FONTS}
          />
          <SelectField
            name="radiusScale"
            label="Corner radius"
            defaultValue={brand?.radiusScale ?? 'md'}
            options={RADIUS}
          />
        </div>
      </ActionForm>

      <aside className="brand-editor__preview" aria-label="Preview" style={previewStyle}>
        <p className="brand-editor__preview-title">Live preview</p>

        <div className="brand-editor__contrast">
          <ContrastPill label="Text on background" ratio={textOnBg} />
          <ContrastPill label="Text on surface" ratio={textOnSurface} />
          <ContrastPill label="Primary on surface" ratio={primaryOnSurface} />
        </div>

        <div className="brand-editor__preview-stage">
          <div className="brand-editor__preview-hero">
            <span className="brand-editor__preview-eyebrow">Your restaurant</span>
            <span className="brand-editor__preview-headline">Hero headline</span>
            <span className="brand-editor__preview-cta">Order</span>
          </div>
          <div className="brand-editor__preview-grid">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="brand-editor__preview-card">
                <div className="brand-editor__preview-image" />
                <div className="brand-editor__preview-card-body">
                  <span className="brand-editor__preview-card-name">Dish {n}</span>
                  <span className="brand-editor__preview-card-price">25 SAR</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function ContrastPill({ label, ratio }: { label: string; ratio: number }) {
  const level =
    ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA Large' : 'Fail';
  const state = ratio >= 4.5 ? 'ok' : ratio >= 3 ? 'warn' : 'fail';
  return (
    <span className="brand-editor__contrast-pill" data-state={state}>
      <span className="brand-editor__contrast-label">{label}</span>
      <span className="brand-editor__contrast-ratio">
        {ratio.toFixed(2)} · {level}
      </span>
    </span>
  );
}
