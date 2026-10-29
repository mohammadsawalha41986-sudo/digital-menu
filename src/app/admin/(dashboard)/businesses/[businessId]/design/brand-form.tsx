'use client';

import { useState } from 'react';
import { ActionForm } from '../../../components';
import type { ActionState } from '@/server/admin/actions';
import { FONT_FACES } from '@/menu-studio/typography';

/* The menu design reads two brand colours: the main colour (buttons, prices,
 * active tabs, and a tint of the dark page) and the highlight (badges, offers,
 * stars). Only those two are offered. The rest of the stored palette is carried
 * through unchanged as hidden fields, so saving here never erases values the
 * logo analysis set. */

const VISIBLE_COLORS = [
  {
    key: 'colorPrimary',
    label: 'اللون الرئيسي · Main colour',
    hint: 'Buttons, prices, the active category, and the tint of the page.',
    fallback: '#059669',
  },
  {
    key: 'colorAccent',
    label: 'لون التمييز · Highlight colour',
    hint: 'Badges, offers and stars.',
    fallback: '#F59E0B',
  },
] as const;

const CARRIED = [
  { key: 'colorSecondary', fallback: '#065F46' },
  { key: 'colorBackground', fallback: '#FBF9F5' },
  { key: 'colorSurface', fallback: '#FFFFFF' },
  { key: 'colorText', fallback: '#16181A' },
  { key: 'colorMuted', fallback: '#6B7280' },
  { key: 'colorBorder', fallback: '#E5E1D8' },
] as const;

type VisibleKey = (typeof VISIBLE_COLORS)[number]['key'];

// Every self-hosted face, labelled by its real family name so an owner
// recognises it. The tabular mono face is for prices only, not a brand font.
const FONTS = FONT_FACES.filter((face) => face.family !== null);

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

function stackOf(key: string): string | undefined {
  return FONTS.find((face) => face.key === key)?.stack;
}

/**
 * Colours and fonts. Starts from what the logo produced; the sample beside the
 * controls mirrors the menu's dark card so a change is visible before saving.
 */
export function BrandForm({
  brand,
  action,
}: {
  brand: Partial<BrandValues> | null;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [colors, setColors] = useState<Record<VisibleKey, string>>(() => ({
    colorPrimary: brand?.colorPrimary ?? VISIBLE_COLORS[0].fallback,
    colorAccent: brand?.colorAccent ?? VISIBLE_COLORS[1].fallback,
  }));
  const [fontHeading, setFontHeading] = useState(brand?.fontHeading ?? 'system-sans');
  const [fontBody, setFontBody] = useState(brand?.fontBody ?? 'system-sans');

  return (
    <ActionForm action={action} submitLabel="حفظ · Save colours & fonts">
      {CARRIED.map((field) => (
        <input key={field.key} type="hidden" name={field.key} value={brand?.[field.key] ?? field.fallback} />
      ))}
      <input type="hidden" name="radiusScale" value={brand?.radiusScale ?? 'lg'} />

      <div className="design__brand">
        <div className="design__brand-fields">
          {VISIBLE_COLORS.map((field) => (
            <div key={field.key} className="admin__field">
              <label className="admin__label" htmlFor={field.key}>
                {field.label}
              </label>
              <div className="brand-editor__color-row">
                <input
                  id={field.key}
                  name={field.key}
                  type="color"
                  value={colors[field.key]}
                  onChange={(event) => setColors((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  className="admin__input brand-editor__color-input"
                />
                <code className="brand-editor__color-code">{colors[field.key].toUpperCase()}</code>
              </div>
              <span className="admin__hint">{field.hint}</span>
            </div>
          ))}

          <div className="admin__field">
            <label className="admin__label" htmlFor="fontHeading">
              خط العناوين · Heading font
            </label>
            <select
              id="fontHeading"
              name="fontHeading"
              className="admin__select"
              value={fontHeading}
              onChange={(event) => setFontHeading(event.target.value)}
            >
              {FONTS.map((face) => (
                <option key={face.key} value={face.key}>
                  {face.family ?? face.label}
                </option>
              ))}
            </select>
          </div>

          <div className="admin__field">
            <label className="admin__label" htmlFor="fontBody">
              خط النصوص · Body font
            </label>
            <select
              id="fontBody"
              name="fontBody"
              className="admin__select"
              value={fontBody}
              onChange={(event) => setFontBody(event.target.value)}
            >
              {FONTS.map((face) => (
                <option key={face.key} value={face.key}>
                  {face.family ?? face.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="design__sample" aria-label="Sample" dir="rtl">
          <span className="design__sample-badge" style={{ background: colors.colorAccent }}>
            عرض
          </span>
          <strong className="design__sample-title" style={{ fontFamily: stackOf(fontHeading) }}>
            شاورما دجاج
          </strong>
          <span className="design__sample-text" style={{ fontFamily: stackOf(fontBody) }}>
            خبز صاج، ثوم، مخلل
          </span>
          <span className="design__sample-row">
            <span className="design__sample-price" style={{ color: colors.colorPrimary }}>
              18 ر.س
            </span>
            <span className="design__sample-button" style={{ background: colors.colorPrimary }}>
              أضف
            </span>
          </span>
        </div>
      </div>
    </ActionForm>
  );
}
