'use client';

import { useActionState } from 'react';
import { ActionButton, ActionForm, TextField } from '../components';
import type { ActionState } from '@/server/admin/actions';
import type { StaffActionState } from '@/server/admin/user-actions';

interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'STAFF';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  memberships: { businessId: string; businessName: string; role: string }[];
}

const BUSINESS_ROLES = ['VIEWER', 'EDITOR', 'MANAGER', 'OWNER'] as const;

/**
 * A generated password is shown once, in the panel that created it, and never
 * again. Anything else — emailing it, storing it, offering to show it later —
 * would be a worse promise than the one the seed already makes.
 */
function CreatePanel({
  action,
}: {
  action: (previous: StaffActionState, formData: FormData) => Promise<StaffActionState>;
}) {
  const [state, formAction] = useActionState<StaffActionState, FormData>(action, {});

  return (
    <section className="admin__panel">
      <h2 className="admin__panel-title">Add a person</h2>

      {state.error ? (
        <p className="admin__message admin__message--error" role="alert">
          {state.error}
        </p>
      ) : null}

      {state.ok && state.password ? (
        <div className="admin__message admin__message--ok" role="status">
          <p>{state.message}</p>
          <p>
            Password for <strong>{state.email}</strong>:{' '}
            <code data-generated-password="">{state.password}</code>
          </p>
          <p className="admin__hint">
            Hand this over now. It is not stored and cannot be shown again — a reset is the
            only way back.
          </p>
        </div>
      ) : null}

      <form action={formAction} className="admin__form">
        <TextField name="name" label="Name" required />
        <TextField name="email" label="Email" type="email" required />

        <label className="admin__field">
          <span className="admin__label">Platform role</span>
          <select name="role" className="admin__select" defaultValue="STAFF">
            <option value="STAFF">Staff — works only on businesses they are granted</option>
            <option value="SUPER_ADMIN">Super admin — every business, and staff management</option>
          </select>
        </label>

        <div className="admin__actions">
          <button type="submit" className="admin__button">
            Create account
          </button>
        </div>
      </form>
    </section>
  );
}

function ResetPassword({ action }: { action: () => Promise<StaffActionState> }) {
  const [state, formAction] = useActionState<StaffActionState, FormData>(
    async () => action(),
    {},
  );

  return (
    <form action={formAction}>
      <button type="submit" className="admin__button admin__button--secondary">
        Reset password
      </button>
      {state.password ? (
        <p className="admin__message admin__message--ok" role="status">
          New password: <code data-generated-password="">{state.password}</code>
        </p>
      ) : null}
      {state.error ? (
        <p className="admin__message admin__message--error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function StaffManager({
  currentUserId,
  staff,
  businesses,
  createStaff,
  grantAccess,
  revokeAccess,
  setActive,
  setRole,
  resetPassword,
}: {
  currentUserId: string;
  staff: StaffRow[];
  businesses: { id: string; label: string }[];
  createStaff: (previous: StaffActionState, formData: FormData) => Promise<StaffActionState>;
  grantAccess: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  revokeAccess: (userId: string, businessId: string) => Promise<ActionState>;
  setActive: (userId: string, isActive: boolean) => Promise<ActionState>;
  setRole: (userId: string, role: 'SUPER_ADMIN' | 'STAFF') => Promise<ActionState>;
  resetPassword: (userId: string) => Promise<StaffActionState>;
}) {
  return (
    <>
      <CreatePanel action={createStaff} />

      {staff.map((person) => (
        <section className="admin__panel" key={person.id} data-staff={person.email}>
          <header className="admin__header">
            <div>
              <h2 className="admin__panel-title">
                {person.name}{' '}
                {person.role === 'SUPER_ADMIN' ? (
                  <span className="admin__badge">super admin</span>
                ) : null}
                {!person.isActive ? <span className="admin__badge">deactivated</span> : null}
              </h2>
              <p className="admin__hint">
                {person.email} · last signed in{' '}
                {person.lastLoginAt
                  ? new Date(person.lastLoginAt).toLocaleString('en-GB')
                  : 'never'}
              </p>
            </div>

            <div className="admin__actions">
              {person.id === currentUserId ? (
                <span className="admin__hint">This is you</span>
              ) : (
                <>
                  <ActionButton
                    action={setRole.bind(
                      null,
                      person.id,
                      person.role === 'SUPER_ADMIN' ? 'STAFF' : 'SUPER_ADMIN',
                    )}
                    label={person.role === 'SUPER_ADMIN' ? 'Make staff' : 'Make super admin'}
                    confirm={
                      person.role === 'SUPER_ADMIN'
                        ? `Remove platform-wide access from ${person.name}?`
                        : `Give ${person.name} access to every business and to staff management?`
                    }
                  />
                  <ResetPassword action={resetPassword.bind(null, person.id)} />
                  <ActionButton
                    action={setActive.bind(null, person.id, !person.isActive)}
                    label={person.isActive ? 'Deactivate' : 'Reactivate'}
                    variant={person.isActive ? 'danger' : 'secondary'}
                    confirm={
                      person.isActive
                        ? `Deactivate ${person.name}? They will not be able to sign in. Nothing they created is deleted.`
                        : undefined
                    }
                  />
                </>
              )}
            </div>
          </header>

          <h3 className="admin__label">Business access</h3>

          {person.role === 'SUPER_ADMIN' ? (
            <p className="admin__hint">
              A super admin reaches every business without a grant, so individual access is not
              listed.
            </p>
          ) : person.memberships.length === 0 ? (
            <p className="admin__empty">
              No businesses yet — this person can sign in and see nothing.
            </p>
          ) : (
            <div className="admin__table-scroll">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th scope="col">Business</th>
                    <th scope="col">Role</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {person.memberships.map((membership) => (
                    <tr key={membership.businessId}>
                      <td>{membership.businessName}</td>
                      <td>{membership.role}</td>
                      <td>
                        <ActionButton
                          action={revokeAccess.bind(null, person.id, membership.businessId)}
                          label="Revoke"
                          variant="danger"
                          confirm={`Revoke ${person.name}'s access to ${membership.businessName}?`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {person.role === 'STAFF' ? (
            <ActionForm action={grantAccess} submitLabel="Grant access">
              <input type="hidden" name="userId" value={person.id} />

              <label className="admin__field">
                <span className="admin__label">Business</span>
                <select name="businessId" className="admin__select" required>
                  <option value="">Choose a business…</option>
                  {businesses.map((business) => (
                    <option key={business.id} value={business.id}>
                      {business.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="admin__field">
                <span className="admin__label">Role on this business</span>
                <select name="role" className="admin__select" defaultValue="EDITOR">
                  {BUSINESS_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <span className="admin__hint">
                  Viewer reads. Editor changes content. Manager also publishes and edits the
                  business. Owner is everything short of platform administration.
                </span>
              </label>
            </ActionForm>
          ) : null}
        </section>
      ))}
    </>
  );
}
