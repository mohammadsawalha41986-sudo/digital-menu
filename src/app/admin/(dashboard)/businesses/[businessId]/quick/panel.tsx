'use client';

import { useActionState } from 'react';
import { ActionButton, ActionForm, TextField } from '../../../components';
import type { ActionState } from '@/server/admin/actions';

interface QuickItem {
  itemCode: string;
  name: string;
  price: string;
  isUnavailable: boolean;
}

/**
 * One price field, submitted on its own.
 *
 * Each row owns its form so submitting one does not re-render the rest, and so
 * an operator can change three prices without waiting between them.
 */
function PriceField({
  action,
  price,
  label,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  price: string;
  label: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="quick__price">
      <input
        name="price"
        defaultValue={price}
        inputMode="decimal"
        className="admin__input quick__input"
        aria-label={`Price for ${label}`}
      />
      <button type="submit" className="admin__button admin__button--secondary">
        Set
      </button>
      {state.error ? (
        <span className="admin__message admin__message--error" role="alert">
          {state.error}
        </span>
      ) : null}
      {state.ok ? (
        <span className="admin__hint" role="status">
          Saved
        </span>
      ) : null}
    </form>
  );
}

export function QuickPanel({
  businessId,
  currency,
  search,
  items,
  offers,
  contact,
  toggleAvailability,
  setPrice,
  toggleOffer,
  saveContact,
}: {
  businessId: string;
  currency: string;
  search: string;
  items: QuickItem[];
  offers: { key: string; title: string; isActive: boolean }[];
  contact: { phone: string | null; whatsapp: string | null };
  toggleAvailability: (businessId: string, itemCode: string) => Promise<ActionState>;
  setPrice: (
    businessId: string,
    itemCode: string,
    previous: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  toggleOffer: (businessId: string, offerKey: string) => Promise<ActionState>;
  saveContact: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  return (
    <>
      <section className="admin__panel">
        <h2 className="admin__panel-title">Items</h2>

        <form method="get" className="admin__actions">
          <input
            name="q"
            defaultValue={search}
            placeholder="Find an item"
            className="admin__input quick__search"
            aria-label="Find an item"
          />
          <button type="submit" className="admin__button admin__button--secondary">
            Find
          </button>
        </form>

        {items.length === 0 ? (
          <p className="admin__empty">No items match.</p>
        ) : (
          <ul className="quick__list">
            {items.map((item) => (
              <li
                key={item.itemCode}
                className="quick__row"
                data-quick-item={item.itemCode}
                data-unavailable={item.isUnavailable ? '' : undefined}
              >
                <span className="quick__name">
                  {item.name}
                  <span className="admin__hint"> {item.itemCode}</span>
                </span>

                <PriceField
                  action={setPrice.bind(null, businessId, item.itemCode)}
                  price={item.price}
                  label={item.name}
                />

                <ActionButton
                  action={toggleAvailability.bind(null, businessId, item.itemCode)}
                  label={item.isUnavailable ? 'Back in stock' : 'Out of stock'}
                  variant={item.isUnavailable ? 'secondary' : 'danger'}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="admin__hint">Prices are in {currency}. Every change is recorded.</p>
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Offers</h2>
        {offers.length === 0 ? (
          <p className="admin__empty">No offers.</p>
        ) : (
          <ul className="quick__list">
            {offers.map((offer) => (
              <li key={offer.key} className="quick__row" data-quick-offer={offer.key}>
                <span className="quick__name">
                  {offer.title}
                  <span className="admin__hint">{offer.isActive ? ' live' : ' paused'}</span>
                </span>
                <ActionButton
                  action={toggleOffer.bind(null, businessId, offer.key)}
                  label={offer.isActive ? 'Pause' : 'Resume'}
                  variant={offer.isActive ? 'danger' : 'secondary'}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Contact</h2>
        <ActionForm action={saveContact} submitLabel="Save numbers">
          <TextField name="phone" label="Phone" defaultValue={contact.phone} dir="ltr" />
          <TextField name="whatsapp" label="WhatsApp" defaultValue={contact.whatsapp} dir="ltr" />
        </ActionForm>
      </section>
    </>
  );
}
