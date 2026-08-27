'use client';

import { ActionButton, ActionForm, TextField } from '../../../components';
import type { ActionState } from '@/server/admin/actions';

interface BranchRow {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string | null;
  phone: string | null;
  isActive: boolean;
}

export function BranchEditor({
  businessId,
  publicId,
  branches,
  createBranch,
  deleteBranch,
}: {
  businessId: string;
  publicId: string;
  branches: BranchRow[];
  createBranch: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  deleteBranch: (
    businessId: string,
    branchId: string,
    publicId: string,
  ) => Promise<ActionState>;
}) {
  return (
    <>
      <section className="admin__panel">
        <h2 className="admin__panel-title">Existing branches</h2>
        {branches.length === 0 ? (
          <p className="admin__empty">No branches yet.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">Key</th>
                  <th scope="col">Name</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Public URL</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr key={branch.id} data-branch-admin={branch.key}>
                    <td>
                      <code>{branch.key}</code>
                    </td>
                    <td>{branch.nameEn ?? branch.nameAr}</td>
                    <td>{branch.phone ?? '—'}</td>
                    <td>
                      <a href={`/m/${publicId}/b/${branch.key}`} target="_blank" rel="noreferrer">
                        /m/{publicId}/b/{branch.key}
                      </a>
                    </td>
                    <td>
                      <ActionButton
                        action={deleteBranch.bind(null, businessId, branch.id, publicId)}
                        label="Remove"
                        variant="danger"
                        confirm={`Remove branch ${branch.key}? Any printed branch QR will stop resolving to it.`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Add a branch</h2>
        <ActionForm action={createBranch} submitLabel="Add branch">
          <div className="admin__grid">
            <TextField name="key" label="Key" hint="Lowercase, e.g. olaya" required />
            <TextField name="nameAr" label="Name (Arabic)" dir="rtl" required />
            <TextField name="nameEn" label="Name (English)" />
            <TextField name="phone" label="Phone" />
            <TextField name="whatsapp" label="WhatsApp" />
            <TextField name="googleMapsUrl" label="Google Maps URL" />
            <TextField name="addressAr" label="Address (Arabic)" dir="rtl" />
            <TextField name="addressEn" label="Address (English)" />
            <TextField name="sortOrder" label="Sort order" defaultValue="0" />
          </div>
        </ActionForm>
      </section>
    </>
  );
}
