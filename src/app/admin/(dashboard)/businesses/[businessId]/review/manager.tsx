'use client';

import { useActionState } from 'react';
import { ActionButton, ActionForm } from '../../../components';
import type { ActionState } from '@/server/admin/actions';
import type { PreviewLinkState } from '@/server/admin/review-actions';

interface LinkRow {
  id: string;
  key: string;
  recipientNote: string | null;
  expiresAt: string;
  revokedAt: string | null;
  state: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
  respondedAt: string | null;
  responseNote: string | null;
  respondedBy: string | null;
  viewCount: number;
  lastViewed: string | null;
  createdAt: string;
  createdBy: string | null;
  isExpired: boolean;
  isUsable: boolean;
}

interface RequestRow {
  id: string;
  body: string;
  isDone: boolean;
  createdAt: string;
  completedBy: string | null;
}

const STATE_LABEL: Record<LinkRow['state'], string> = {
  PENDING: 'Awaiting a response',
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
};

function CreateLink({
  action,
}: {
  action: (previous: PreviewLinkState, formData: FormData) => Promise<PreviewLinkState>;
}) {
  const [state, formAction] = useActionState<PreviewLinkState, FormData>(action, {});

  return (
    <section className="admin__panel">
      <h2 className="admin__panel-title">Send for review</h2>
      <p className="admin__hint">
        Creates a link the client can open without an account. It shows the profile as it will
        look, including work that is not published yet, and records nothing in the business’s
        visitor numbers.
      </p>

      {state.error ? (
        <p className="admin__message admin__message--error" role="alert">
          {state.error}
        </p>
      ) : null}

      {state.ok && state.url ? (
        <div className="admin__message admin__message--ok" role="status">
          <p>{state.message}</p>
          <p>
            <code data-preview-url="">{state.url}</code>
          </p>
          <p className="admin__hint">
            The link is not stored, so it cannot be shown again. If it is lost, create another
            and revoke this one.
          </p>
        </div>
      ) : null}

      <form action={formAction} className="admin__form">
        <label className="admin__field">
          <span className="admin__label">Who is it for?</span>
          <input
            name="recipientNote"
            className="admin__input"
            placeholder="e.g. Abu Khalid, owner"
          />
          <span className="admin__hint">A note for your own records. Never shown to anyone.</span>
        </label>

        <label className="admin__field">
          <span className="admin__label">Expires after</span>
          <select name="days" className="admin__select" defaultValue="14">
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </label>

        <div className="admin__actions">
          <button type="submit" className="admin__button">
            Create preview link
          </button>
        </div>
      </form>
    </section>
  );
}

export function ReviewManager({
  businessId,
  links,
  requests,
  createLink,
  revokeLink,
  addRequest,
  setDone,
}: {
  businessId: string;
  links: LinkRow[];
  requests: RequestRow[];
  createLink: (previous: PreviewLinkState, formData: FormData) => Promise<PreviewLinkState>;
  revokeLink: (businessId: string, linkId: string) => Promise<ActionState>;
  addRequest: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  setDone: (businessId: string, requestId: string, isDone: boolean) => Promise<ActionState>;
}) {
  const open = requests.filter((request) => !request.isDone);

  return (
    <>
      <CreateLink action={createLink} />

      <section className="admin__panel">
        <h2 className="admin__panel-title">Links sent</h2>

        {links.length === 0 ? (
          <p className="admin__empty">No preview link has been sent yet.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">For</th>
                  <th scope="col">State</th>
                  <th scope="col">Opened</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link.id} data-preview-link={link.key}>
                    <td>
                      {link.recipientNote ?? '—'}
                      <span className="admin__hint"> · by {link.createdBy ?? 'unknown'}</span>
                    </td>
                    <td>
                      {STATE_LABEL[link.state]}
                      {link.responseNote ? (
                        <p className="admin__hint">
                          “{link.responseNote}”
                          {link.respondedBy ? ` — ${link.respondedBy}` : ''}
                        </p>
                      ) : null}
                    </td>
                    <td>
                      {link.viewCount === 0
                        ? 'Not yet'
                        : `${link.viewCount}×, last ${new Date(link.lastViewed as string).toLocaleDateString('en-GB')}`}
                    </td>
                    <td>
                      {link.revokedAt
                        ? 'Revoked'
                        : link.isExpired
                          ? 'Expired'
                          : new Date(link.expiresAt).toLocaleDateString('en-GB')}
                    </td>
                    <td>
                      {link.isUsable ? (
                        <ActionButton
                          action={revokeLink.bind(null, businessId, link.id)}
                          label="Revoke"
                          variant="danger"
                          confirm="Revoke this link? Anyone holding it will immediately see nothing."
                        />
                      ) : (
                        <span className="admin__hint">No longer usable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">
          Change requests {open.length > 0 ? `(${open.length} open)` : ''}
        </h2>
        <p className="admin__hint">
          What the client asked for, whether it arrived through a preview link or over the
          phone. Client notes are recorded exactly as written and are never acted on
          automatically.
        </p>

        {requests.length === 0 ? (
          <p className="admin__empty">Nothing outstanding.</p>
        ) : (
          <ul className="admin__findings">
            {requests.map((request) => (
              <li key={request.id} data-change-request={request.id}>
                <span className="admin__finding-area">
                  {new Date(request.createdAt).toLocaleDateString('en-GB')}
                </span>
                <span
                  className="admin__finding-message"
                  style={request.isDone ? { opacity: 0.55 } : undefined}
                >
                  {request.body}
                  {request.isDone && request.completedBy ? (
                    <span className="admin__hint"> · done by {request.completedBy}</span>
                  ) : null}
                </span>
                <ActionButton
                  action={setDone.bind(null, businessId, request.id, !request.isDone)}
                  label={request.isDone ? 'Reopen' : 'Mark done'}
                />
              </li>
            ))}
          </ul>
        )}

        <ActionForm action={addRequest} submitLabel="Record request">
          <label className="admin__field">
            <span className="admin__label">Add one yourself</span>
            <textarea
              name="body"
              rows={3}
              className="admin__input"
              placeholder="Client called: change the burger price to 45."
            />
          </label>
        </ActionForm>
      </section>
    </>
  );
}
