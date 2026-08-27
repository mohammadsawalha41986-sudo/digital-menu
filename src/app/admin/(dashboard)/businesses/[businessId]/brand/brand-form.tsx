'use client';

import { ActionForm, Field, SelectField } from '../../../components';
import type { ActionState } from '@/server/admin/actions';

const COLOR_FIELDS = [
  ['colorPrimary', 'Primary', '#1F2421'],
  ['colorSecondary', 'Secondary', '#49A078'],
  ['colorAccent', 'Accent', '#C9A227'],
  ['colorBackground', 'Background', '#FBF9F5'],
  ['colorSurface', 'Surface', '#FFFFFF'],
  ['colorText', 'Text', '#16181A'],
  ['colorMuted', 'Muted text', '#6B7280'],
  ['colorBorder', 'Border', '#E5E1D8'],
] as const;

const FONTS = [
  { value: 'system-serif', label: 'Serif' },
  { value: 'system-sans', label: 'Sans' },
  { value: 'system-mono', label: 'Mono' },
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

/**
 * Brand editor — the *theme* half of template/theme separation.
 *
 * These values become `--brand-*` custom properties on the public profile.
 * They describe identity only: nothing here changes layout, and no template
 * reads any of them as a value (GOALS I6).
 */
export function BrandForm({
  brand,
  action,
}: {
  brand: Partial<BrandValues> | null;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  return (
    <ActionForm action={action} submitLabel="Save brand">
      <div className="admin__grid">
        {COLOR_FIELDS.map(([name, label, fallback]) => (
          <Field key={name} label={label}>
            {(id) => (
              <input
                id={id}
                name={name}
                type="color"
                defaultValue={brand?.[name] ?? fallback}
                className="admin__input"
              />
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
          options={[
            { value: 'none', label: 'Square' },
            { value: 'sm', label: 'Subtle' },
            { value: 'md', label: 'Medium' },
            { value: 'lg', label: 'Rounded' },
          ]}
        />
      </div>
    </ActionForm>
  );
}
