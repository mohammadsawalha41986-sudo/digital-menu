'use client';

import { useState } from 'react';
import { ActionForm } from '../../../components';
import type { ActionState } from '@/server/admin/actions';
import { FONT_FACES } from '@/menu-studio/typography';

/* Everything about how the menu looks, after the logo has set the palette.
 *
 * Two brand colours are always set (buttons, highlights). Page, card and price
 * colours start on "automatic" — derived from the logo — and become the owner's
 * own the moment they untick it. The rest of the stored palette is carried
 * through unchanged as hidden fields, so saving here never erases values the
 * logo analysis set. */

const CARRIED = [
  { key: 'colorSecondary', fallback: '#065F46' },
  { key: 'colorBackground', fallback: '#FBF9F5' },
  { key: 'colorSurface', fallback: '#FFFFFF' },
  { key: 'colorText', fallback: '#16181A' },
  { key: 'colorMuted', fallback: '#6B7280' },
  { key: 'colorBorder', fallback: '#E5E1D8' },
] as const;

const OPTIONAL_COLORS = [
  {
    key: 'menuPage',
    label: 'لون الخلفية · Page background',
    hint: 'A light colour switches the menu to dark text automatically.',
    fallback: '#0D120E',
  },
  {
    key: 'menuCard',
    label: 'لون بطاقات الأطباق · Dish cards',
    hint: 'Behind each dish’s name and price.',
    fallback: '#111613',
  },
  {
    key: 'menuPrice',
    label: 'لون الأسعار · Prices',
    hint: 'Automatic uses the highlight colour.',
    fallback: '#F59E0B',
  },
] as const;

type OptionalKey = (typeof OPTIONAL_COLORS)[number]['key'];

// Every self-hosted face, labelled by its real family name so an owner
// recognises it. The tabular mono face is for prices only, not a brand font.
const FONTS = FONT_FACES.filter((face) => face.family !== null);

const TEXT_SCALES = [
  { value: 'sm', label: 'صغير · Small', factor: 0.92 },
  { value: 'md', label: 'متوسط · Medium', factor: 1 },
  { value: 'lg', label: 'كبير · Large', factor: 1.12 },
];

const SPACINGS = [
  { value: 'compact', label: 'متقارب · Compact', factor: 0.8 },
  { value: 'regular', label: 'عادي · Regular', factor: 1 },
  { value: 'airy', label: 'واسع · Airy', factor: 1.2 },
];

const SHAPES = [
  { value: 'landscape', label: 'عريضة · Landscape', ratio: '16 / 10' },
  { value: 'square', label: 'مربعة · Square', ratio: '1 / 1' },
  { value: 'portrait', label: 'طولية · Portrait', ratio: '4 / 5' },
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
  menuPage: string | null;
  menuCard: string | null;
  menuPrice: string | null;
  textScale: string;
  spacing: string;
  imageShape: string;
}

function stackOf(key: string): string | undefined {
  return FONTS.find((face) => face.key === key)?.stack;
}

function isLight(hex: string): boolean {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!) > 0.4;
}

export function BrandForm({
  brand,
  action,
}: {
  brand: Partial<BrandValues> | null;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [primary, setPrimary] = useState(brand?.colorPrimary ?? '#059669');
  const [accent, setAccent] = useState(brand?.colorAccent ?? '#F59E0B');
  const [optional, setOptional] = useState<Record<OptionalKey, string | null>>(() => ({
    menuPage: brand?.menuPage ?? null,
    menuCard: brand?.menuCard ?? null,
    menuPrice: brand?.menuPrice ?? null,
  }));
  const [fontHeading, setFontHeading] = useState(brand?.fontHeading ?? 'system-sans');
  const [fontBody, setFontBody] = useState(brand?.fontBody ?? 'system-sans');
  const [textScale, setTextScale] = useState(brand?.textScale ?? 'md');
  const [spacing, setSpacing] = useState(brand?.spacing ?? 'regular');
  const [imageShape, setImageShape] = useState(brand?.imageShape ?? 'landscape');

  // What the sample shows: the owner's colours where set, the design's
  // automatic ones otherwise.
  const page = optional.menuPage ?? '#0d120e';
  const light = optional.menuPage ? isLight(optional.menuPage) : false;
  const card = optional.menuCard ?? (light ? '#ffffff' : '#111613');
  const price = optional.menuPrice ?? accent;
  const ink = light ? '#1c1917' : '#fafaf9';
  const textFactor = TEXT_SCALES.find((entry) => entry.value === textScale)?.factor ?? 1;
  const spaceFactor = SPACINGS.find((entry) => entry.value === spacing)?.factor ?? 1;
  const ratio = SHAPES.find((entry) => entry.value === imageShape)?.ratio ?? '16 / 10';

  return (
    <ActionForm action={action} submitLabel="حفظ · Save design">
      {CARRIED.map((field) => (
        <input key={field.key} type="hidden" name={field.key} value={brand?.[field.key] ?? field.fallback} />
      ))}
      <input type="hidden" name="radiusScale" value={brand?.radiusScale ?? 'lg'} />

      <div className="design__brand">
        <div className="design__brand-fields">
          <fieldset className="admin__fieldset design__group">
            <legend className="admin__label">الألوان · Colours</legend>

            <ColorField
              id="colorPrimary"
              label="لون الأزرار · Buttons & main colour"
              hint="Buttons, the active category, and the tint of the page."
              value={primary}
              onChange={setPrimary}
            />
            <ColorField
              id="colorAccent"
              label="لون التمييز · Highlight colour"
              hint="Badges, offers and stars."
              value={accent}
              onChange={setAccent}
            />

            {OPTIONAL_COLORS.map((field) => {
              const value = optional[field.key];
              return (
                <div key={field.key} className="admin__field">
                  <span className="admin__label">{field.label}</span>
                  <label className="design__auto">
                    <input
                      type="checkbox"
                      checked={value === null}
                      onChange={(event) =>
                        setOptional((prev) => ({ ...prev, [field.key]: event.target.checked ? null : field.fallback }))
                      }
                    />
                    تلقائي من الشعار · Automatic from the logo
                  </label>
                  {value === null ? (
                    <input type="hidden" name={field.key} value="" />
                  ) : (
                    <div className="brand-editor__color-row">
                      <input
                        id={field.key}
                        name={field.key}
                        type="color"
                        aria-label={field.label}
                        value={value}
                        onChange={(event) => setOptional((prev) => ({ ...prev, [field.key]: event.target.value }))}
                        className="admin__input brand-editor__color-input"
                      />
                      <code className="brand-editor__color-code">{value.toUpperCase()}</code>
                    </div>
                  )}
                  <span className="admin__hint">{field.hint}</span>
                </div>
              );
            })}
          </fieldset>

          <fieldset className="admin__fieldset design__group">
            <legend className="admin__label">الخطوط والمسافات · Type & spacing</legend>

            <Select id="fontHeading" label="خط العناوين · Heading font" value={fontHeading} onChange={setFontHeading}
              options={FONTS.map((face) => ({ value: face.key, label: face.family ?? face.label }))} />
            <Select id="fontBody" label="خط النصوص · Body font" value={fontBody} onChange={setFontBody}
              options={FONTS.map((face) => ({ value: face.key, label: face.family ?? face.label }))} />
            <Select id="textScale" label="حجم الخط · Text size" value={textScale} onChange={setTextScale} options={TEXT_SCALES} />
            <Select id="spacing" label="المسافات · Spacing" value={spacing} onChange={setSpacing} options={SPACINGS} />
            <Select id="imageShape" label="شكل الصور · Photo shape" value={imageShape} onChange={setImageShape} options={SHAPES} />
          </fieldset>
        </div>

        <div
          className="design__sample"
          aria-label="Sample"
          dir="rtl"
          style={{ background: page, color: ink, gap: `${0.5 * spaceFactor}rem`, padding: `${1 * spaceFactor}rem` }}
        >
          <div className="design__sample-card" style={{ background: card }}>
            <div className="design__sample-photo" style={{ aspectRatio: ratio, background: `linear-gradient(135deg, ${primary}, ${accent})` }} />
            <div style={{ padding: `${0.6 * spaceFactor}rem`, display: 'grid', gap: `${0.3 * spaceFactor}rem` }}>
              <span className="design__sample-badge" style={{ background: accent }}>عرض</span>
              <strong style={{ fontFamily: stackOf(fontHeading), fontSize: `${1.05 * textFactor}rem` }}>شاورما دجاج</strong>
              <span style={{ fontFamily: stackOf(fontBody), fontSize: `${0.8 * textFactor}rem`, opacity: 0.75 }}>خبز صاج، ثوم، مخلل</span>
              <span className="design__sample-row">
                <span style={{ color: price, fontWeight: 800, fontSize: `${1 * textFactor}rem` }}>18 ر.س</span>
                <span className="design__sample-button" style={{ background: primary }}>أضف</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </ActionForm>
  );
}

function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="admin__field">
      <label className="admin__label" htmlFor={id}>
        {label}
      </label>
      <div className="brand-editor__color-row">
        <input
          id={id}
          name={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="admin__input brand-editor__color-input"
        />
        <code className="brand-editor__color-code">{value.toUpperCase()}</code>
      </div>
      <span className="admin__hint">{hint}</span>
    </div>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="admin__field">
      <label className="admin__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} name={id} className="admin__select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
