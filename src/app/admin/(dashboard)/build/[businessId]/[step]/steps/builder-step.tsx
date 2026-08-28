'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/server/admin/actions';

/**
 * Step 7 — the builder.
 *
 * Sections and dishes on the left; click one and it opens on the right, with
 * the live preview between them. Clicking a dish is the only way in: there is
 * no separate "edit item" screen to navigate to and come back from.
 *
 * The forms post to the same `upsertItem` and category services the detailed
 * admin uses, so nothing here is a second way to write a menu.
 */

export interface BuilderItem {
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  price: string;
  calories: string;
  categoryKey: string;
  availability: string;
  imageUrl: string | null;
}

export interface BuilderCategory {
  key: string;
  name: string;
  items: BuilderItem[];
}

const BLANK: BuilderItem = {
  code: '',
  nameAr: '',
  nameEn: '',
  descriptionAr: '',
  price: '',
  calories: '',
  categoryKey: '',
  availability: 'AVAILABLE',
  imageUrl: null,
};

export function BuilderStep({
  categories,
  currency,
  saveItem,
  addCategory,
}: {
  categories: BuilderCategory[];
  currency: string;
  saveItem: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  addCategory: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [itemState, submitItem] = useActionState<ActionState, FormData>(saveItem, {});
  const [categoryState, submitCategory] = useActionState<ActionState, FormData>(addCategory, {});
  const [selected, setSelected] = useState<BuilderItem | null>(null);
  const [addingSection, setAddingSection] = useState(categories.length === 0);

  // A new dish needs a code that is stable across renders — the spreadsheet
  // matches on it, and a value regenerated mid-typing would remount the fields.
  // It is derived from data instead of from a clock: the component's own id
  // plus the number of dishes that exist. After a save the server sends fresh
  // data, the count moves, and the next new dish gets the next code — so two
  // added in a row never collide, with no clock and no effect.
  const instance = useId().replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase();
  const total = categories.reduce((sum, category) => sum + category.items.length, 0);

  const editing = selected ?? {
    ...BLANK,
    categoryKey: categories[0]?.key ?? '',
    code: `NEW-${instance}-${total + 1}`,
  };

  return (
    <div className="build__builder">
      <section className="build__card build__builder-list" aria-label="Menu contents">
        <h2 className="build__step-subtitle">Your menu</h2>

        {categories.length === 0 ? (
          <p className="admin__empty">No sections yet.</p>
        ) : (
          <ol className="build__sections">
            {categories.map((category) => (
              <li key={category.key}>
                <p className="studio__category">
                  <span className="studio__category-name">{category.name}</span>
                  <span className="studio__category-count">{category.items.length}</span>
                </p>

                <ul className="studio__items">
                  {category.items.map((item) => (
                    <li key={item.code}>
                      <button
                        type="button"
                        className="build__item-button"
                        aria-pressed={selected?.code === item.code}
                        onClick={() => setSelected(item)}
                      >
                        <span>{item.nameEn || item.nameAr}</span>
                        <span className="studio__item-meta">
                          {item.price === '' ? (
                            <span className="studio__item-flag">no price</span>
                          ) : (
                            `${item.price} ${currency}`
                          )}
                          {item.imageUrl ? null : <span className="studio__item-flag">no photo</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}

        <div className="build__actions">
          <button
            type="button"
            className="admin__button admin__button--secondary"
            onClick={() => setAddingSection((value) => !value)}
          >
            {addingSection ? 'Cancel' : 'Add a section'}
          </button>
          {categories.length > 0 ? (
            <button
              type="button"
              className="admin__button admin__button--secondary"
              onClick={() => setSelected(null)}
            >
              Add a dish
            </button>
          ) : null}
        </div>

        {addingSection ? (
          <form action={submitCategory} className="build__inline-form">
            {categoryState.error ? (
              <p className="admin__message admin__message--error" role="alert">
                {categoryState.error}
              </p>
            ) : null}
            {categoryState.ok && categoryState.message ? (
              <p className="admin__message admin__message--ok" role="status">
                {categoryState.message}
              </p>
            ) : null}

            <div className="admin__field">
              <label className="admin__label" htmlFor="section-name-ar">
                Section name, in Arabic
              </label>
              <input
                id="section-name-ar"
                name="nameAr"
                dir="rtl"
                className="admin__input"
                required
              />
            </div>
            <div className="admin__field">
              <label className="admin__label" htmlFor="section-name-en">
                Section name, in English
              </label>
              <input id="section-name-en" name="nameEn" className="admin__input" />
            </div>

            <Save label="Add section" />
          </form>
        ) : null}
      </section>

      <form action={submitItem} className="build__card build__builder-edit" aria-label="Edit dish">
        <h2 className="build__step-subtitle">{selected ? 'Edit dish' : 'New dish'}</h2>

        {itemState.error ? (
          <p className="admin__message admin__message--error" role="alert">
            {itemState.error}
          </p>
        ) : null}
        {itemState.ok && itemState.message ? (
          <p className="admin__message admin__message--ok" role="status">
            {itemState.message}
          </p>
        ) : null}

        {categories.length === 0 ? (
          <p className="admin__empty">Add a section first — every dish belongs to one.</p>
        ) : (
          <>
            {/* The code is the stable key the spreadsheet matches on. It is
                generated for a new dish and never shown as something to edit. */}
            <input type="hidden" name="itemCode" value={editing.code} key={editing.code} />

            <div className="admin__field">
              <label className="admin__label" htmlFor="item-name-ar">
                Name, in Arabic
              </label>
              <input
                id="item-name-ar"
                name="nameAr"
                dir="rtl"
                className="admin__input"
                defaultValue={editing.nameAr}
                key={`ar-${editing.code}`}
                required
              />
            </div>

            <div className="admin__field">
              <label className="admin__label" htmlFor="item-name-en">
                Name, in English
              </label>
              <input
                id="item-name-en"
                name="nameEn"
                className="admin__input"
                defaultValue={editing.nameEn}
                key={`en-${editing.code}`}
              />
            </div>

            <div className="admin__grid">
              <div className="admin__field">
                <label className="admin__label" htmlFor="item-price">
                  Price ({currency})
                </label>
                <input
                  id="item-price"
                  name="price"
                  className="admin__input"
                  defaultValue={editing.price}
                  key={`price-${editing.code}`}
                  placeholder="38"
                />
              </div>

              <div className="admin__field">
                <label className="admin__label" htmlFor="item-calories">
                  Calories
                </label>
                <input
                  id="item-calories"
                  name="calories"
                  className="admin__input"
                  defaultValue={editing.calories}
                  key={`kcal-${editing.code}`}
                />
                <span className="admin__hint">Only if you know it. Left empty, none is shown.</span>
              </div>
            </div>

            <div className="admin__field">
              <label className="admin__label" htmlFor="item-description">
                Description, in Arabic
              </label>
              <textarea
                id="item-description"
                name="descriptionAr"
                dir="rtl"
                rows={2}
                className="admin__input"
                defaultValue={editing.descriptionAr}
                key={`desc-${editing.code}`}
              />
            </div>

            <div className="admin__grid">
              <div className="admin__field">
                <label className="admin__label" htmlFor="item-category">
                  Section
                </label>
                <select
                  id="item-category"
                  name="categoryKey"
                  className="admin__select"
                  defaultValue={editing.categoryKey || categories[0]?.key}
                  key={`cat-${editing.code}`}
                >
                  {categories.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin__field">
                <label className="admin__label" htmlFor="item-availability">
                  Availability
                </label>
                <select
                  id="item-availability"
                  name="availability"
                  className="admin__select"
                  defaultValue={editing.availability}
                  key={`avail-${editing.code}`}
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="UNAVAILABLE">Temporarily unavailable</option>
                  <option value="SEASONAL">Seasonal</option>
                  <option value="HIDDEN">Hidden</option>
                </select>
              </div>
            </div>

            <Save label={selected ? 'Save dish' : 'Add dish'} />
          </>
        )}
      </form>
    </div>
  );
}

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <div className="build__actions">
      <button type="submit" className="admin__button" disabled={pending}>
        {pending ? 'Saving…' : label}
      </button>
    </div>
  );
}
