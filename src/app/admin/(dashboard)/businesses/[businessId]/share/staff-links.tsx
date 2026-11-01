'use client';

import { useActionState, useState } from 'react';
import {
  createStaffLinkAction,
  revokeStaffLinkAction,
  type StaffLinkState,
} from '@/server/admin/staff-link-actions';
import type { ActionState } from '@/server/admin/actions';
import type { StaffLinkView } from '@/server/staff/service';

/**
 * Links for the restaurant's own staff: mark dishes out or hidden from the menu
 * without signing in. Each link is for one restaurant and can do nothing else.
 */
export function StaffLinks({ businessId, links }: { businessId: string; links: StaffLinkView[] }) {
  const create = createStaffLinkAction.bind(null, businessId);
  const [state, formAction] = useActionState<StaffLinkState, FormData>(create, {});
  const [copied, setCopied] = useState(false);

  return (
    <section className="admin__panel">
      <h2 className="admin__panel-title">Staff link · رابط الموظف</h2>
      <p className="admin__hint">
        Give a person on the floor or in the kitchen a link. It opens a page of this
        restaurant&apos;s dishes, where they can mark each one out right now, or hidden
        from the menu, and put it back. It cannot change prices, names or photos, and
        it works until you revoke it or it expires.
      </p>
      <p className="admin__hint">
        Branch-specific settings still apply to that branch: a dish hidden here stays
        hidden everywhere, but a branch that set its own availability keeps it.
      </p>

      {state.error ? (
        <p className="admin__message admin__message--error" role="alert">{state.error}</p>
      ) : state.ok && state.message ? (
        <div className="admin__message admin__message--ok" role="status">
          {state.message}
          {state.url ? (
            <p className="admin__hint">
              <a href={state.url} target="_blank" rel="noreferrer">{state.url}</a>
              {' '}
              <button
                type="button"
                className="admin__button admin__button--secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(state.url ?? '');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      <form action={formAction} className="admin__form">
        <label className="admin__field">
          <span className="admin__label">Name the link</span>
          <input
            name="label"
            className="admin__input"
            placeholder="Front desk · Kitchen"
            maxLength={60}
            required
          />
        </label>
        <label className="admin__field">
          <span className="admin__label">Expires after</span>
          <select name="days" className="admin__select" defaultValue="180">
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
          </select>
        </label>
        <div className="admin__actions">
          <button type="submit" className="admin__button">
            Create staff link
          </button>
        </div>
      </form>

      {links.length === 0 ? (
        <p className="admin__empty">No staff link yet.</p>
      ) : (
        <div className="admin__table-scroll">
          <table className="admin__table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">State</th>
                <th scope="col">Last used</th>
                <th scope="col">Expires</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <StaffLinkRow key={link.id} businessId={businessId} link={link} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StaffLinkRow({ businessId, link }: { businessId: string; link: StaffLinkView }) {
  const revoke = async (_previous: ActionState, formData: FormData): Promise<ActionState> =>
    revokeStaffLinkAction(businessId, String(formData.get('linkId') ?? ''));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(revoke, {});

  const stateLabel = link.revokedAt ? 'Revoked' : link.isExpired ? 'Expired' : 'Active';

  return (
    <tr data-staff-link={link.key}>
      <td>
        {link.label}
        {link.createdBy ? <span className="admin__hint"> · by {link.createdBy}</span> : null}
      </td>
      <td>{stateLabel}</td>
      <td>
        {link.lastUsedAt ? (
          <>
            {link.lastUsedAt.toLocaleDateString()}
            <span className="admin__hint"> · {link.useCount} changes</span>
          </>
        ) : (
          <span className="admin__hint">Not used yet</span>
        )}
      </td>
      <td>{link.expiresAt.toLocaleDateString()}</td>
      <td>
        {link.isUsable ? (
          <form action={formAction}>
            <input type="hidden" name="linkId" value={link.id} />
            <button type="submit" className="admin__button admin__button--danger" disabled={pending}>
              Revoke
            </button>
          </form>
        ) : (
          <span className="admin__hint">No longer usable</span>
        )}
        {state.error ? (
          <span className="admin__message admin__message--error" role="alert">{state.error}</span>
        ) : state.ok && state.message ? (
          <span className="admin__message admin__message--ok" role="status">{state.message}</span>
        ) : null}
      </td>
    </tr>
  );
}
