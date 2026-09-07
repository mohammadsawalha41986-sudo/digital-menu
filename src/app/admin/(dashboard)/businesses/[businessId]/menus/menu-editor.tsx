'use client';

import Link from 'next/link';

import { MoveButtons } from '../../../move-buttons';
import { DuplicateButton } from '../../../duplicate-button';
import { ActionButton, ActionForm, SelectField, TextField } from '../../../components';
import type { ActionState } from '@/server/admin/actions';

interface ItemRow {
  id: string;
  itemCode: string;
  nameAr: string;
  nameEn: string | null;
  price: string;
  calories: number | null;
  availability: string;
}

interface CategoryRow {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string | null;
  items: ItemRow[];
}

interface MenuRow {
  id: string;
  key: string;
  titleAr: string;
  titleEn: string | null;
  status: string;
  publishedVersion: number | null;
  publishedAt: string | null;
  categories: CategoryRow[];
}

/**
 * Menu, category and item editing.
 *
 * Every control here performs a real write: Save persists, Publish runs the
 * publication transaction, Remove deletes. Nothing is a placeholder.
 */
export function MenuEditor({
  businessId,
  publicId,
  currency,
  menus,
  categoryKeys,
  createMenu,
  createCategory,
  publishMenu,
  deleteCategory,
  upsertItem,
  deleteItem,
}: {
  businessId: string;
  publicId: string;
  currency: string;
  menus: MenuRow[];
  categoryKeys: string[];
  createMenu: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  createCategory: (
    businessId: string,
    menuId: string,
    publicId: string,
    previous: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  publishMenu: (businessId: string, menuId: string, publicId: string) => Promise<ActionState>;
  deleteCategory: (
    businessId: string,
    categoryId: string,
    publicId: string,
  ) => Promise<ActionState>;
  upsertItem: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  deleteItem: (businessId: string, itemId: string, publicId: string) => Promise<ActionState>;
}) {
  return (
    <>
      <section className="admin__panel">
        <h2 className="admin__panel-title">New menu</h2>
        <ActionForm action={createMenu} submitLabel="Create menu">
          <div className="admin__grid">
            <TextField name="key" label="Key" hint="e.g. main, breakfast, drinks" required />
            <TextField name="titleAr" label="Title (Arabic)" dir="rtl" required />
            <TextField name="titleEn" label="Title (English)" />
            <SelectField
              name="status"
              label="Status"
              defaultValue="DRAFT"
              options={[
                { value: 'DRAFT', label: 'Draft' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
                { value: 'ARCHIVED', label: 'Archived' },
              ]}
            />
            <TextField name="sortOrder" label="Sort order" defaultValue="0" />
          </div>
        </ActionForm>
      </section>

      {menus.map((menu) => (
        <section className="admin__panel" key={menu.id} data-menu-admin={menu.key}>
          <header className="admin__header">
            <div>
              <h2 className="admin__panel-title">
                {menu.titleEn ?? menu.titleAr} <code>({menu.key})</code>
              </h2>
              <p className="admin__hint">
                {menu.publishedVersion === null
                  ? 'Never published — not visible to visitors.'
                  : `Published version ${menu.publishedVersion}${
                      menu.publishedAt ? ` on ${menu.publishedAt.slice(0, 10)}` : ''
                    }.`}{' '}
                Status: {menu.status}.
              </p>
            </div>
            <div className="admin__actions">
              {/* History sits beside Publish because the question "what will
                  this change?" is asked immediately before pressing it. */}
              <Link
                href={`/admin/businesses/${businessId}/menus/${menu.id}/versions`}
                className="admin__button admin__button--secondary"
              >
                History &amp; changes
              </Link>
              <ActionButton
                action={publishMenu.bind(null, businessId, menu.id, publicId)}
                label="Publish"
                pendingLabel="Publishing…"
                variant="primary"
              />
            </div>
          </header>

          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Item</th>
                  <th scope="col">Category</th>
                  <th scope="col" className="admin__numeric">Price ({currency})</th>
                  <th scope="col" className="admin__numeric">Calories</th>
                  <th scope="col">Availability</th>
                  <th scope="col">Order</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {menu.categories.flatMap((category) =>
                  category.items.map((item, index) => (
                    <tr key={item.id} data-item-admin={item.itemCode}>
                      <td>
                        <code>{item.itemCode}</code>
                      </td>
                      <td>{item.nameEn ?? item.nameAr}</td>
                      <td>{category.key}</td>
                      <td className="admin__numeric">{item.price || '—'}</td>
                      <td className="admin__numeric">{item.calories ?? '—'}</td>
                      <td>{item.availability}</td>
                      <td>
                        <MoveButtons
                          businessId={businessId}
                          scope="item"
                          id={item.id}
                          label={item.nameEn ?? item.nameAr}
                          isFirst={index === 0}
                          isLast={index === category.items.length - 1}
                        />
                      </td>
                      <td className="admin__row-actions">
                        <DuplicateButton
                          businessId={businessId}
                          scope="item"
                          id={item.id}
                          label={item.nameEn ?? item.nameAr}
                        />
                        <ActionButton
                          action={deleteItem.bind(null, businessId, item.id, publicId)}
                          label="Remove"
                          variant="danger"
                          confirm={`Remove ${item.itemCode}?`}
                        />
                      </td>
                    </tr>
                  )),
                )}
                {menu.categories.every((category) => category.items.length === 0) ? (
                  <tr>
                    <td colSpan={8} className="admin__empty">
                      No items yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <details>
            <summary className="admin__label">Add a category</summary>
            <ActionForm
              action={createCategory.bind(null, businessId, menu.id, publicId)}
              submitLabel="Add category"
            >
              <div className="admin__grid">
                <TextField name="key" label="Key" hint="e.g. starters" required />
                <TextField name="nameAr" label="Name (Arabic)" dir="rtl" required />
                <TextField name="nameEn" label="Name (English)" />
                <TextField name="sortOrder" label="Sort order" defaultValue="0" />
              </div>
            </ActionForm>
          </details>

          {menu.categories.length > 0 ? (
            <>
              <h3 className="admin__label">Sections</h3>
              <ul className="admin__section-list">
                {menu.categories.map((category, index) => (
                  <li key={category.id} data-category-admin={category.key}>
                    <span className="admin__section-name">
                      {category.nameEn ?? category.nameAr}
                      <span className="admin__hint"> · {category.key}</span>
                    </span>
                    <MoveButtons
                      businessId={businessId}
                      scope="category"
                      id={category.id}
                      label={category.nameEn ?? category.nameAr}
                      isFirst={index === 0}
                      isLast={index === menu.categories.length - 1}
                    />
                    <span className="admin__row-actions">
                      <DuplicateButton
                        businessId={businessId}
                        scope="category"
                        id={category.id}
                        label={category.nameEn ?? category.nameAr}
                      />
                      <ActionButton
                        action={deleteCategory.bind(null, businessId, category.id, publicId)}
                        label="Remove"
                        variant="danger"
                        confirm={`Remove category ${category.key} and its items?`}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ))}

      <section className="admin__panel">
        <h2 className="admin__panel-title">Add or update an item</h2>
        <p className="admin__hint">
          Matched on item code: an existing code updates that item rather than creating a
          duplicate. Leave calories empty unless the business supplied a measured figure.
        </p>
        <ActionForm action={upsertItem} submitLabel="Save item">
          <div className="admin__grid">
            <TextField name="itemCode" label="Item code" hint="e.g. MN-001" required />
            <SelectField
              name="categoryKey"
              label="Category"
              options={categoryKeys.map((key) => ({ value: key, label: key }))}
            />
            <TextField name="nameAr" label="Name (Arabic)" dir="rtl" required />
            <TextField name="nameEn" label="Name (English)" />
            <TextField name="price" label={`Price (${currency})`} hint="Blank means no price shown" />
            <TextField name="calories" label="Calories" hint="Blank unless measured" />
            <SelectField
              name="availability"
              label="Availability"
              defaultValue="AVAILABLE"
              options={[
                { value: 'AVAILABLE', label: 'Available' },
                { value: 'UNAVAILABLE', label: 'Currently unavailable' },
                { value: 'SEASONAL', label: 'Seasonal' },
                { value: 'HIDDEN', label: 'Hidden from the profile' },
              ]}
            />
            <TextField name="sortOrder" label="Sort order" defaultValue="0" />
          </div>
        </ActionForm>
      </section>
    </>
  );
}
