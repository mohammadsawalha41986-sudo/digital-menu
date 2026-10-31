'use client';

import { useActionState, useState } from 'react';
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
  id: string;
  key: string;
  name: string;
  nameAr: string;
  nameEn: string;
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

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export interface BuilderActions {
  saveItem: Action;
  addCategory: Action;
  renameCategory: Action;
  moveCategory: Action;
  deleteCategory: Action;
  deleteItem: Action;
  duplicateItem: Action;
}

export function BuilderStep({
  categories,
  currency,
  actions,
}: {
  categories: BuilderCategory[];
  currency: string;
  actions: BuilderActions;
}) {
  const [itemState, submitItem] = useActionState<ActionState, FormData>(actions.saveItem, {});
  const [categoryState, submitCategory] = useActionState<ActionState, FormData>(actions.addCategory, {});
  const [renameState, submitRename] = useActionState<ActionState, FormData>(actions.renameCategory, {});
  const [moveState, submitMove] = useActionState<ActionState, FormData>(actions.moveCategory, {});
  const [removeState, submitRemove] = useActionState<ActionState, FormData>(actions.deleteCategory, {});
  const [dishDeleteState, submitDishDelete] = useActionState<ActionState, FormData>(actions.deleteItem, {});
  const [copyState, submitCopy] = useActionState<ActionState, FormData>(actions.duplicateItem, {});
  const [addingSection, setAddingSection] = useState(categories.length === 0);

  // Each choice remembers the action result current when it was made, so a
  // rename that saves closes its form and a deleted dish leaves the editor
  // without an effect writing state back.
  const [pick, setPick] = useState<{ item: BuilderItem; since: ActionState } | null>(null);
  const selected = pick && !(dishDeleteState.ok && dishDeleteState !== pick.since) ? pick.item : null;
  const setSelected = (item: BuilderItem | null) => setPick(item ? { item, since: dishDeleteState } : null);
  const [renameOpen, setRenameOpen] = useState<{ id: string; since: ActionState } | null>(null);
  const renaming =
    renameOpen && (renameState === renameOpen.since || renameState.error) ? renameOpen.id : null;
  const setRenaming = (id: string | null) => setRenameOpen(id ? { id, since: renameState } : null);

  // A new dish carries no code: the server gives it one that is free. (A
  // code made here from a count of dishes repeated after a delete, and the
  // save then overwrote the dish that already had it.)
  const editing = selected ?? { ...BLANK, categoryKey: categories[0]?.key ?? '' };
  const sectionNotice = [renameState, moveState, removeState].find((state) => state.error);

  return (
    <div className="build__builder">
      <section className="build__card build__builder-list" aria-label="Menu contents">
        <h2 className="build__step-subtitle">Your menu</h2>

        {categories.length === 0 ? (
          <p className="admin__empty">No sections yet.</p>
        ) : (
          <ol className="build__sections">
            {categories.map((category, index) => (
              <li key={category.key} data-builder-section={category.key}>
                {renaming === category.id ? (
                  <form action={submitRename} className="build__inline-form" aria-label="Rename section">
                    <input type="hidden" name="categoryId" value={category.id} />
                    <input
                      name="nameAr"
                      dir="rtl"
                      className="admin__input"
                      defaultValue={category.nameAr}
                      aria-label="اسم القسم بالعربي · Section name (AR)"
                      required
                    />
                    <input
                      name="nameEn"
                      className="admin__input"
                      defaultValue={category.nameEn}
                      aria-label="Section name (EN)"
                    />
                    <div className="build__actions">
                      <Save label="حفظ الاسم · Save name" />
                      <button type="button" className="admin__button admin__button--secondary" onClick={() => setRenaming(null)}>
                        إلغاء · Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="studio__category build__section-head">
                    <span className="studio__category-name">{category.name}</span>
                    <span className="studio__category-count">{category.items.length}</span>
                    <span className="build__section-tools">
                      <form action={submitMove}>
                        <input type="hidden" name="categoryId" value={category.id} />
                        <button
                          name="direction"
                          value="up"
                          className="build__icon-button"
                          disabled={index === 0}
                          aria-label={`نقل «${category.name}» للأعلى · Move up`}
                        >
                          ▲
                        </button>
                        <button
                          name="direction"
                          value="down"
                          className="build__icon-button"
                          disabled={index === categories.length - 1}
                          aria-label={`نقل «${category.name}» للأسفل · Move down`}
                        >
                          ▼
                        </button>
                      </form>
                      <button
                        type="button"
                        className="build__icon-button"
                        onClick={() => setRenaming(category.id)}
                        aria-label={`تعديل اسم «${category.name}» · Rename`}
                      >
                        ✎
                      </button>
                      <form
                        action={submitRemove}
                        onSubmit={(event) => {
                          if (!window.confirm(`حذف قسم «${category.name}»؟`)) event.preventDefault();
                        }}
                      >
                        <input type="hidden" name="categoryId" value={category.id} />
                        <button
                          className="build__icon-button"
                          disabled={category.items.length > 0}
                          title={category.items.length > 0 ? 'انقل أطباقه أو احذفها أولاً · Empty it first' : undefined}
                          aria-label={`حذف «${category.name}» · Delete section`}
                        >
                          🗑
                        </button>
                      </form>
                    </span>
                  </div>
                )}

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

        {sectionNotice?.error ? (
          <p className="admin__message admin__message--error" role="alert">
            {sectionNotice.error}
          </p>
        ) : null}

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
            {editing.code ? <input type="hidden" name="itemCode" value={editing.code} key={editing.code} /> : null}

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

      {selected ? (
        <div className="build__card build__dish-tools" aria-label="Dish tools">
          {[dishDeleteState, copyState].map((state, index) =>
            state.error ? (
              <p key={index} className="admin__message admin__message--error" role="alert">
                {state.error}
              </p>
            ) : state.ok && state.message ? (
              <p key={index} className="admin__message admin__message--ok" role="status">
                {state.message}
              </p>
            ) : null,
          )}
          <div className="build__actions">
            <form action={submitCopy}>
              <input type="hidden" name="itemCode" value={selected.code} />
              <Save label="نسخ الطبق · Duplicate" secondary />
            </form>
            <form
              action={submitDishDelete}
              onSubmit={(event) => {
                if (!window.confirm(`حذف «${selected.nameAr}» نهائياً؟`)) event.preventDefault();
              }}
            >
              <input type="hidden" name="itemCode" value={selected.code} />
              <Save label="حذف الطبق · Delete dish" danger />
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Save({ label, secondary, danger }: { label: string; secondary?: boolean; danger?: boolean }) {
  const { pending } = useFormStatus();
  const tone = danger ? ' admin__button--danger' : secondary ? ' admin__button--secondary' : '';

  return (
    <div className="build__actions">
      <button type="submit" className={`admin__button${tone}`} disabled={pending}>
        {pending ? 'Saving…' : label}
      </button>
    </div>
  );
}
