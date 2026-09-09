'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { ActionButton, TextField } from '../components';
import type { ActionState } from '@/server/admin/actions';
import type { ApiKeyState } from '@/server/admin/api-key-actions';

interface ClientRow {
  id: string;
  name: string;
  tokenPrefix: string;
  scope: string;
  permissions: string;
  marketingClientId: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export function ApiKeyManager({
  clients,
  createKey,
  revokeKey,
}: {
  clients: ClientRow[];
  createKey: (previous: ApiKeyState, formData: FormData) => Promise<ApiKeyState>;
  revokeKey: (clientId: string) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState<ApiKeyState, FormData>(createKey, {});

  return (
    <>
      <section className="admin__panel">
        <h2 className="admin__panel-title">Issue a key</h2>
        <form action={formAction} className="admin__form">
          {state.error ? (
            <p className="admin__message admin__message--error" role="alert">{state.error}</p>
          ) : null}

          {state.token ? (
            <div className="admin__message admin__message--ok" role="status">
              <p>{state.message}</p>
              <p className="admin__destination" data-issued-token="">{state.token}</p>
            </div>
          ) : null}

          <div className="admin__grid">
            <TextField name="name" label="Name" hint="e.g. Menu integration" required />
            <TextField
              name="businessPublicIds"
              label="Business scope"
              hint="Public ids, comma separated. Empty means platform-wide."
            />
            <div className="admin__field">
              <label className="admin__label" htmlFor="api-access">Permission</label>
              <select id="api-access" name="access" className="admin__select" defaultValue="read">
                <option value="read">Read only</option>
                <option value="write">Read + write</option>
              </select>
              <span className="admin__hint">Write keys can change menu content through supported API endpoints.</span>
            </div>
            <TextField
              name="marketingClientId"
              label="Marketing client id"
              hint="Optional. How the consuming system identifies this client."
            />
            <TextField name="expiresAt" label="Expires" type="datetime-local" />
          </div>

          <div className="admin__actions"><SubmitButton /></div>
        </form>
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Existing keys</h2>
        {clients.length === 0 ? (
          <p className="admin__empty">No keys issued.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Prefix</th>
                  <th scope="col">Business scope</th>
                  <th scope="col">Permission</th>
                  <th scope="col">Marketing id</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last used</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} data-api-key={client.tokenPrefix}>
                    <td>{client.name}</td>
                    <td><code>dpo_{client.tokenPrefix}…</code></td>
                    <td>{client.scope}</td>
                    <td>{client.permissions}</td>
                    <td>{client.marketingClientId ?? '—'}</td>
                    <td>{client.isActive ? 'Active' : 'Revoked'}</td>
                    <td>{client.lastUsedAt?.slice(0, 16).replace('T', ' ') ?? 'Never'}</td>
                    <td>
                      {client.isActive ? (
                        <ActionButton
                          action={revokeKey.bind(null, client.id)}
                          label="Revoke"
                          variant="danger"
                          confirm={`Revoke ${client.name}? Any system using it stops working immediately.`}
                        />
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="admin__button" disabled={pending}>
      {pending ? 'Issuing…' : 'Issue key'}
    </button>
  );
}
