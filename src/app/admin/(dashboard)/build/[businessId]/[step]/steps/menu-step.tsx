'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { pasteMenuAction } from '@/server/admin/wizard-actions';
import type { ActionState } from '@/server/admin/actions';

/**
 * Step 5 — get the menu in.
 *
 * Three doors, in the order they are actually used: paste the text (most
 * owners have their menu as a message or a document), import the spreadsheet
 * (the existing importer, with its mapping and validation), or type it in the
 * builder. None of them is a new import engine.
 */
export function MenuStep({
  businessId,
  itemCount,
  templateUrl,
}: {
  businessId: string;
  itemCount: number;
  templateUrl: string;
}) {
  const [state, submit] = useActionState<ActionState, FormData>(pasteMenuAction, {});

  return (
    <div className="build__stack">
      <form action={submit} className="build__card">
        <h2 className="build__step-title">Add your menu</h2>

        {itemCount > 0 ? (
          // Not a live region: this is standing information, and announcing it
          // alongside the result of an action makes both harder to hear.
          <p className="admin__hint">
            {itemCount} {itemCount === 1 ? 'item is' : 'items are'} on this menu already.
          </p>
        ) : null}

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

        <div className="admin__field">
          <label className="admin__label" htmlFor="menu-text">
            Paste your menu
          </label>
          <textarea
            id="menu-text"
            name="menuText"
            rows={10}
            className="admin__input build__paste"
            placeholder={'Starters\nHummus | 18 | With olive oil\nFattoush | 22\n\nMains\nMixed grill | 85'}
          />
          <span className="admin__hint">
            A line on its own is a section. Under it, <code>Dish | Price | Description</code> —
            the description is optional.
          </span>
        </div>

        <Paste />
      </form>

      <div className="build__card">
        <h3 className="build__step-subtitle">Have a spreadsheet?</h3>
        <p className="admin__hint">
          The importer reads Excel and CSV, matches your column names in Arabic or English, shows
          you every row and every problem, and only writes when you confirm.
        </p>
        <div className="build__actions">
          <Link href={`/admin/businesses/${businessId}/data`} className="admin__button admin__button--secondary">
            Import a spreadsheet
          </Link>
          <a href={templateUrl} className="admin__button admin__button--secondary">
            Download the template
          </a>
        </div>
      </div>

      <div className="build__card">
        <h3 className="build__step-subtitle">Rather type it?</h3>
        <p className="admin__hint">Add sections and dishes one at a time, with the menu beside you.</p>
        <div className="build__actions">
          <Link href={`/admin/build/${businessId}/builder`} className="admin__button admin__button--secondary">
            Build it by hand
          </Link>
        </div>
      </div>
    </div>
  );
}

function Paste() {
  const { pending } = useFormStatus();

  return (
    <div className="build__actions">
      <button type="submit" className="admin__button" disabled={pending}>
        {pending ? 'Reading…' : 'Add these items'}
      </button>
    </div>
  );
}
