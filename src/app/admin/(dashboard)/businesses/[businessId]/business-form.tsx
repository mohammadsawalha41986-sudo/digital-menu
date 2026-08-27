'use client';

import { ActionForm, CheckboxField, SelectField, TextArea, TextField } from '../../components';
import type { ActionState } from '@/server/admin/actions';

const TYPES = [
  'RESTAURANT',
  'CAFE',
  'BAKERY',
  'DESSERT',
  'SALON',
  'BEAUTY_CENTER',
  'SPA',
  'BARBER',
  'GYM',
  'HOTEL',
  'RETAIL',
  'OTHER',
] as const;

const CURRENCIES = ['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'USD'] as const;

export interface BusinessFormValues {
  nameAr: string;
  nameEn: string | null;
  slug: string;
  type: string;
  status: string;
  defaultLocale: string;
  currency: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  facebook: string | null;
  linkedin: string | null;
  youtube: string | null;
  googleMapsUrl: string | null;
  addressAr: string | null;
  addressEn: string | null;
  indexProfile: boolean;
  showPlatformFooter: boolean;
}

/**
 * Business editor.
 *
 * Arabic fields come first and are marked `dir="rtl"`, because Arabic is the
 * authored language rather than a translation target (GOALS I3). English
 * fields are optional throughout: the platform never fills them in.
 */
export function BusinessForm({
  business,
  action,
  submitLabel,
}: {
  business: Partial<BusinessFormValues>;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel}>
      <div className="admin__grid">
        <TextField
          name="nameAr"
          label="Name (Arabic)"
          defaultValue={business.nameAr}
          dir="rtl"
          required
        />
        <TextField
          name="nameEn"
          label="Name (English)"
          defaultValue={business.nameEn}
          hint="Optional. Left empty, English visitors see the Arabic name."
        />
        <TextField
          name="slug"
          label="Slug"
          defaultValue={business.slug}
          hint="Internal handle. Not the public URL."
          required
        />
        <SelectField
          name="type"
          label="Business type"
          defaultValue={business.type ?? 'RESTAURANT'}
          options={TYPES.map((value) => ({ value, label: value.replace(/_/g, ' ') }))}
        />
        <SelectField
          name="status"
          label="Status"
          defaultValue={business.status ?? 'DRAFT'}
          options={[
            { value: 'DRAFT', label: 'Draft — not publicly visible' },
            { value: 'ACTIVE', label: 'Active — public' },
            { value: 'INACTIVE', label: 'Inactive — hidden' },
          ]}
        />
        <SelectField
          name="defaultLocale"
          label="Default language"
          defaultValue={business.defaultLocale ?? 'ar'}
          options={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ]}
        />
        <SelectField
          name="currency"
          label="Currency"
          defaultValue={business.currency ?? 'SAR'}
          options={CURRENCIES.map((value) => ({ value, label: value }))}
        />
      </div>

      <div className="admin__grid">
        <TextArea
          name="descriptionAr"
          label="Description (Arabic)"
          defaultValue={business.descriptionAr}
          dir="rtl"
        />
        <TextArea
          name="descriptionEn"
          label="Description (English)"
          defaultValue={business.descriptionEn}
        />
      </div>

      <div className="admin__grid">
        <TextField name="phone" label="Phone" defaultValue={business.phone} />
        <TextField name="whatsapp" label="WhatsApp" defaultValue={business.whatsapp} />
        <TextField name="email" label="Email" type="email" defaultValue={business.email} />
        <TextField name="website" label="Website" defaultValue={business.website} />
        <TextField name="googleMapsUrl" label="Google Maps URL" defaultValue={business.googleMapsUrl} />
      </div>

      <div className="admin__grid">
        <TextField name="instagram" label="Instagram" defaultValue={business.instagram} />
        <TextField name="tiktok" label="TikTok" defaultValue={business.tiktok} />
        <TextField name="facebook" label="Facebook" defaultValue={business.facebook} />
        <TextField name="linkedin" label="LinkedIn" defaultValue={business.linkedin} />
        <TextField name="youtube" label="YouTube" defaultValue={business.youtube} />
      </div>

      <div className="admin__grid">
        <TextArea name="addressAr" label="Address (Arabic)" defaultValue={business.addressAr} dir="rtl" />
        <TextArea name="addressEn" label="Address (English)" defaultValue={business.addressEn} />
      </div>

      <div className="admin__grid">
        <CheckboxField
          name="indexProfile"
          label="Allow search indexing"
          defaultChecked={business.indexProfile}
          hint="Off by default. Profiles stay out of search results until enabled."
        />
        <CheckboxField
          name="showPlatformFooter"
          label="Show platform footer"
          defaultChecked={business.showPlatformFooter}
          hint='Adds "Digital menu by …" to the public profile.'
        />
      </div>
    </ActionForm>
  );
}
