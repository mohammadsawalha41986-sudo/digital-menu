'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  deleteModifierGroupAction,
  saveModifierGroupAction,
} from '@/server/admin/studio-actions';
import type { ActionState } from '@/server/admin/actions';

/**
 * Modifiers and add-ons (Menu Studio §10).
 *
 * Groups are edited whole: name, bounds and every option in one submission.
 * Partial saves are what make a "Size" list end up with two "Large" rows, so
 * the form always sends the complete set and the service replaces it.
 *
 * Rows are added and removed on the client for convenience, but the form is
 * plain: four blank rows are always present, so the panel still works with no
 * JavaScript at all.
 */

interface Group {
  key: string;
  nameAr: string;
  nameEn: string | null;
  minSelect: number;
  maxSelect: number;
  options: { key: string; nameAr: string; nameEn: string | null; priceDeltaMinor: number }[];
}

function Submit({ label, className = 'admin__button' }: { label: string; className?: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? `${label}…` : label}
    </button>
  );
}

export function ModifiersPanel({
  businessId,
  groups,
  currency,
}: {
  businessId: string;
  groups: Group[];
  currency: string;
}) {
  const [saveState, save] = useActionState<ActionState, FormData>(saveModifierGroupAction, {});
  const [deleteState, remove] = useActionState<ActionState, FormData>(
    deleteModifierGroupAction,
    {},
  );
  const [editing, setEditing] = useState<Group | null>(null);
  const [rows, setRows] = useState(4);
  const formId = useId();

  const option = (index: number) => editing?.options[index];

  return (
    <section className="admin__panel">
      <h2 className="admin__panel-title">Modifiers and add-ons</h2>
      <p className="admin__hint">
        A group belongs to the business, not to one item, so editing “Milk” changes it everywhere
        it is offered. Prices are differences: “Large +3.00” survives a change to the base price.
      </p>

      {deleteState.error ? (
        <p className="admin__message admin__message--error" role="alert">
          {deleteState.error}
        </p>
      ) : null}
      {deleteState.ok && deleteState.message ? (
        <p className="admin__message admin__message--ok" role="status">
          {deleteState.message}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="admin__empty">No modifier groups yet.</p>
      ) : (
        <ul className="studio__groups">
          {groups.map((group) => (
            <li key={group.key} className="studio__group">
              <div>
                <strong>{group.nameEn ?? group.nameAr}</strong>{' '}
                <code className="admin__hint">{group.key}</code>
                <p className="admin__hint">
                  {group.minSelect > 0 ? 'Required' : 'Optional'} · choose{' '}
                  {group.minSelect === group.maxSelect
                    ? group.maxSelect
                    : `${group.minSelect}–${group.maxSelect}`}{' '}
                  · {group.options.length} options
                </p>
                <p className="admin__hint">
                  {group.options
                    .map((entry) =>
                      entry.priceDeltaMinor === 0
                        ? (entry.nameEn ?? entry.nameAr)
                        : `${entry.nameEn ?? entry.nameAr} ${entry.priceDeltaMinor > 0 ? '+' : '−'}${(
                            Math.abs(entry.priceDeltaMinor) / 100
                          ).toFixed(2)}`,
                    )
                    .join(' · ')}
                </p>
              </div>

              <div className="studio__group-actions">
                <button
                  type="button"
                  className="admin__button admin__button--secondary"
                  onClick={() => {
                    setEditing(group);
                    setRows(Math.max(4, group.options.length + 1));
                  }}
                >
                  Edit
                </button>

                <form
                  action={remove}
                  onSubmit={(event) => {
                    if (!window.confirm(`Delete the “${group.nameEn ?? group.nameAr}” group?`)) {
                      event.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="key" value={group.key} />
                  <Submit label="Delete" className="admin__button admin__button--danger" />
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={save} className="admin__form" key={editing?.key ?? 'new'}>
        {saveState.error ? (
          <p className="admin__message admin__message--error" role="alert">
            {saveState.error}
          </p>
        ) : null}
        {saveState.ok && saveState.message ? (
          <p className="admin__message admin__message--ok" role="status">
            {saveState.message}
          </p>
        ) : null}

        <input type="hidden" name="businessId" value={businessId} />

        <h3 className="studio__subhead">{editing ? `Edit ${editing.key}` : 'New group'}</h3>

        <div className="admin__grid">
          <div className="admin__field">
            <label className="admin__label" htmlFor={`${formId}-key`}>
              Key
            </label>
            <input
              id={`${formId}-key`}
              name="key"
              className="admin__input"
              defaultValue={editing?.key ?? ''}
              required
            />
          </div>
          <div className="admin__field">
            <label className="admin__label" htmlFor={`${formId}-name-ar`}>
              Name (Arabic)
            </label>
            <input
              id={`${formId}-name-ar`}
              name="nameAr"
              dir="rtl"
              className="admin__input"
              defaultValue={editing?.nameAr ?? ''}
              required
            />
          </div>
          <div className="admin__field">
            <label className="admin__label" htmlFor={`${formId}-name-en`}>
              Name (English)
            </label>
            <input
              id={`${formId}-name-en`}
              name="nameEn"
              className="admin__input"
              defaultValue={editing?.nameEn ?? ''}
            />
          </div>
          <div className="admin__field">
            <label className="admin__label" htmlFor={`${formId}-min`}>
              Minimum choices
            </label>
            <input
              id={`${formId}-min`}
              name="minSelect"
              type="number"
              min={0}
              className="admin__input"
              defaultValue={editing?.minSelect ?? 0}
            />
          </div>
          <div className="admin__field">
            <label className="admin__label" htmlFor={`${formId}-max`}>
              Maximum choices
            </label>
            <input
              id={`${formId}-max`}
              name="maxSelect"
              type="number"
              min={1}
              className="admin__input"
              defaultValue={editing?.maxSelect ?? 1}
            />
          </div>
        </div>

        <h3 className="studio__subhead">Options</h3>
        {/* Four columns of inputs cannot fit a phone. The table scrolls inside
            its own container rather than widening the page under it. */}
        <div className="admin__table-scroll">
          <table className="admin__table">
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Name (Arabic)</th>
              <th scope="col">Name (English)</th>
              <th scope="col">Price change ({currency})</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, index) => (
              <tr key={index}>
                <td>
                  <input
                    name="optionKey"
                    className="admin__input"
                    aria-label={`Option ${index + 1} key`}
                    defaultValue={option(index)?.key ?? ''}
                  />
                </td>
                <td>
                  <input
                    name="optionNameAr"
                    dir="rtl"
                    className="admin__input"
                    aria-label={`Option ${index + 1} Arabic name`}
                    defaultValue={option(index)?.nameAr ?? ''}
                  />
                </td>
                <td>
                  <input
                    name="optionNameEn"
                    className="admin__input"
                    aria-label={`Option ${index + 1} English name`}
                    defaultValue={option(index)?.nameEn ?? ''}
                  />
                </td>
                <td>
                  <input
                    name="optionDelta"
                    type="number"
                    step="0.01"
                    className="admin__input"
                    aria-label={`Option ${index + 1} price change`}
                    defaultValue={
                      option(index) ? (option(index)!.priceDeltaMinor / 100).toFixed(2) : ''
                    }
                  />
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>

        <div className="admin__actions">
          <button
            type="button"
            className="admin__button admin__button--secondary"
            onClick={() => setRows((count) => count + 1)}
          >
            Add a row
          </button>
          {editing ? (
            <button
              type="button"
              className="admin__button admin__button--secondary"
              onClick={() => {
                setEditing(null);
                setRows(4);
              }}
            >
              Cancel
            </button>
          ) : null}
          <Submit label="Save group" />
        </div>
      </form>
    </section>
  );
}
