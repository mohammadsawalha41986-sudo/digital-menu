'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { bulkEditAction } from '@/server/admin/studio-actions';
import type { ActionState } from '@/server/admin/actions';

/**
 * Bulk edit (Menu Studio §27).
 *
 * A plain form: checkboxes, one operation, one value. Selection lives in the
 * form itself rather than in a store, so the whole thing works with JavaScript
 * disabled and the server re-checks every code anyway.
 *
 * The result line reports what actually changed and what was not found —
 * never a bare "saved".
 */

interface Row {
  code: string;
  name: string;
  category: string;
  price: number | null;
  availability: string;
  tags: string[];
}

const OPERATIONS = [
  { key: 'availability', label: 'Set availability', input: 'availability' },
  { key: 'category', label: 'Move to category', input: 'category' },
  { key: 'feature', label: 'Feature', input: 'boolean' },
  { key: 'add-tag', label: 'Add tags', input: 'text' },
  { key: 'remove-tag', label: 'Remove tags', input: 'text' },
  { key: 'set-price', label: 'Set price', input: 'number' },
  { key: 'adjust-price', label: 'Adjust price by %', input: 'number' },
  { key: 'delete', label: 'Delete', input: 'none' },
] as const;

export function BulkEdit({
  businessId,
  rows,
  categories,
  currency,
}: {
  businessId: string;
  rows: Row[];
  categories: { key: string; name: string }[];
  currency: string;
}) {
  const [state, submit] = useActionState<ActionState, FormData>(bulkEditAction, {});
  const [operation, setOperation] = useState<(typeof OPERATIONS)[number]['key']>('availability');
  const selectAllId = useId();

  const active = OPERATIONS.find((entry) => entry.key === operation)!;

  return (
    <section className="admin__panel">
      <h2 className="admin__panel-title">Bulk edit</h2>

      {rows.length === 0 ? (
        <p className="admin__empty">This menu has no items yet.</p>
      ) : (
        <form
          action={submit}
          onSubmit={(event) => {
            if (operation === 'delete' && !window.confirm('Delete the selected items?')) {
              event.preventDefault();
            }
          }}
        >
          {state.error ? (
            <p className="admin__message admin__message--error" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.ok && state.message ? (
            <p className="admin__message admin__message--ok" role="status">
              {state.message}
            </p>
          ) : null}

          <input type="hidden" name="businessId" value={businessId} />

          <div className="studio__bulk-controls">
            <div className="admin__field">
              <label className="admin__label" htmlFor={`${selectAllId}-op`}>
                Change
              </label>
              <select
                id={`${selectAllId}-op`}
                name="operation"
                className="admin__select"
                value={operation}
                onChange={(event) =>
                  setOperation(event.target.value as (typeof OPERATIONS)[number]['key'])
                }
              >
                {OPERATIONS.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>

            {active.input === 'none' ? null : (
              <div className="admin__field">
                <label className="admin__label" htmlFor={`${selectAllId}-value`}>
                  {active.input === 'number' && operation === 'set-price'
                    ? `Price (${currency})`
                    : active.input === 'number'
                      ? 'Percentage'
                      : 'Value'}
                </label>

                {active.input === 'availability' ? (
                  <select id={`${selectAllId}-value`} name="value" className="admin__select">
                    <option value="AVAILABLE">Available</option>
                    <option value="UNAVAILABLE">Temporarily unavailable</option>
                    <option value="HIDDEN">Hidden from the menu</option>
                  </select>
                ) : active.input === 'category' ? (
                  <select id={`${selectAllId}-value`} name="value" className="admin__select">
                    {categories.map((category) => (
                      <option key={category.key} value={category.key}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                ) : active.input === 'boolean' ? (
                  <select id={`${selectAllId}-value`} name="value" className="admin__select">
                    <option value="true">Featured</option>
                    <option value="false">Not featured</option>
                  </select>
                ) : (
                  <input
                    id={`${selectAllId}-value`}
                    name="value"
                    type={active.input === 'number' ? 'number' : 'text'}
                    step={active.input === 'number' ? '0.01' : undefined}
                    className="admin__input"
                    placeholder={active.input === 'text' ? 'popular, spicy' : undefined}
                  />
                )}
              </div>
            )}

            <ApplyButton />
          </div>

          {/* Scrolls within itself: a six-column table must not widen the
              page on a phone. */}
          <div className="admin__table-scroll">
            <table className="admin__table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="admin__visually-hidden">Select</span>
                </th>
                <th scope="col">Item</th>
                <th scope="col">Category</th>
                <th scope="col">Price</th>
                <th scope="col">Availability</th>
                <th scope="col">Tags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code}>
                  <td>
                    <input
                      type="checkbox"
                      name="itemCode"
                      value={row.code}
                      aria-label={`Select ${row.name}`}
                    />
                  </td>
                  <td>
                    {row.name}
                    <br />
                    <code className="admin__hint">{row.code}</code>
                  </td>
                  <td>{row.category}</td>
                  <td>
                    {row.price === null ? (
                      <span className="admin__hint">no price</span>
                    ) : (
                      `${(row.price / 100).toFixed(2)} ${currency}`
                    )}
                  </td>
                  <td>{row.availability.toLowerCase()}</td>
                  <td>{row.tags.join(', ')}</td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </form>
      )}
    </section>
  );
}

function ApplyButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="admin__button" disabled={pending}>
      {pending ? 'Applying…' : 'Apply to selected'}
    </button>
  );
}
