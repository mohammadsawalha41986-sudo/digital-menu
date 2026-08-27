'use client';

import { ActionButton, ActionForm, CheckboxField, SelectField, TextArea, TextField } from '../../../components';
import type { ActionState } from '@/server/admin/actions';

interface OfferRow {
  id: string;
  key: string;
  titleAr: string;
  titleEn: string | null;
  state: string;
  placement: string;
  startsAt: string | null;
  endsAt: string | null;
  offerPrice: string | null;
}

const STATE_LABEL: Record<string, string> = {
  live: 'Live now',
  scheduled: 'Scheduled',
  expired: 'Expired — not shown',
  disabled: 'Disabled',
};

export function OfferManager({
  businessId,
  publicId,
  currency,
  offers,
  upsertOffer,
  deleteOffer,
}: {
  businessId: string;
  publicId: string;
  currency: string;
  offers: OfferRow[];
  upsertOffer: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  deleteOffer: (businessId: string, offerId: string, publicId: string) => Promise<ActionState>;
}) {
  return (
    <>
      <section className="admin__panel">
        <h2 className="admin__panel-title">Current offers</h2>
        {offers.length === 0 ? (
          <p className="admin__empty">No offers yet.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">Key</th>
                  <th scope="col">Title</th>
                  <th scope="col">State</th>
                  <th scope="col">Placement</th>
                  <th scope="col">Window</th>
                  <th scope="col" className="admin__numeric">Price ({currency})</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => (
                  <tr key={offer.id} data-offer-admin={offer.key}>
                    <td>
                      <code>{offer.key}</code>
                    </td>
                    <td>{offer.titleEn ?? offer.titleAr}</td>
                    <td>{STATE_LABEL[offer.state] ?? offer.state}</td>
                    <td>{offer.placement}</td>
                    <td>
                      {offer.startsAt?.slice(0, 16).replace('T', ' ') ?? '—'} →{' '}
                      {offer.endsAt?.slice(0, 16).replace('T', ' ') ?? '—'}
                    </td>
                    <td className="admin__numeric">{offer.offerPrice ?? '—'}</td>
                    <td>
                      <ActionButton
                        action={deleteOffer.bind(null, businessId, offer.id, publicId)}
                        label="Remove"
                        variant="danger"
                        confirm={`Remove offer ${offer.key}?`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Create or update an offer</h2>
        <p className="admin__hint">
          Reusing a key updates that offer. Times are read in the timezone below, not the
          server&rsquo;s.
        </p>
        <ActionForm action={upsertOffer} submitLabel="Save offer">
          <div className="admin__grid">
            <TextField name="key" label="Key" hint="e.g. ramadan-set" required />
            <TextField name="titleAr" label="Title (Arabic)" dir="rtl" required />
            <TextField name="titleEn" label="Title (English)" />
            <SelectField
              name="placement"
              label="Placement"
              defaultValue="FEATURED"
              options={[
                { value: 'HERO', label: 'Hero' },
                { value: 'FEATURED', label: 'Featured' },
                { value: 'BANNER', label: 'Banner' },
                { value: 'SECTION', label: 'Offers section' },
              ]}
            />
          </div>

          <div className="admin__grid">
            <TextArea name="descriptionAr" label="Description (Arabic)" dir="rtl" />
            <TextArea name="descriptionEn" label="Description (English)" />
          </div>

          <div className="admin__grid">
            <TextField name="originalPrice" label={`Original price (${currency})`} />
            <TextField name="offerPrice" label={`Offer price (${currency})`} />
            <TextField name="ctaLabelAr" label="CTA label (Arabic)" dir="rtl" />
            <TextField name="ctaLabelEn" label="CTA label (English)" />
            <TextField name="ctaUrl" label="CTA link" />
          </div>

          <div className="admin__grid">
            <TextField name="startsAt" label="Starts" type="datetime-local" />
            <TextField name="endsAt" label="Ends" type="datetime-local" />
            <TextField name="timezone" label="Timezone" defaultValue="Asia/Riyadh" />
            <TextField name="sortOrder" label="Sort order" defaultValue="0" />
          </div>

          <div className="admin__grid">
            <CheckboxField name="isActive" label="Enabled" defaultChecked />
            <CheckboxField name="isFeatured" label="Feature this offer" />
          </div>
        </ActionForm>
      </section>
    </>
  );
}
