'use client';

import { ActionButton, ActionForm, CheckboxField, Field, TextField } from '../../../components';
import type { ActionState } from '@/server/admin/actions';

interface FileRow {
  id: string;
  key: string;
  kind: string;
  titleAr: string;
  titleEn: string | null;
  isPublic: boolean;
  allowDownload: boolean;
  externalUrl: string | null;
  versionCount: number;
  currentVersion: number | null;
  sizeBytes: number | null;
}

export function FileManager({
  businessId,
  publicId,
  files,
  uploadFile,
  createLink,
  toggleVisibility,
  deleteFile,
}: {
  businessId: string;
  publicId: string;
  files: FileRow[];
  uploadFile: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  createLink: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  toggleVisibility: (
    businessId: string,
    fileId: string,
    publicId: string,
    isPublic: boolean,
  ) => Promise<ActionState>;
  deleteFile: (businessId: string, fileId: string, publicId: string) => Promise<ActionState>;
}) {
  return (
    <>
      <section className="admin__panel">
        <h2 className="admin__panel-title">Published files and links</h2>
        {files.length === 0 ? (
          <p className="admin__empty">Nothing published yet.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">Key</th>
                  <th scope="col">Title</th>
                  <th scope="col">Kind</th>
                  <th scope="col" className="admin__numeric">Version</th>
                  <th scope="col" className="admin__numeric">Size</th>
                  <th scope="col">Public</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id} data-file-admin={file.key}>
                    <td>
                      <code>{file.key}</code>
                    </td>
                    <td>{file.titleEn ?? file.titleAr}</td>
                    <td>{file.kind}</td>
                    <td className="admin__numeric">
                      {file.currentVersion ?? '—'}
                      {file.versionCount > 1 ? ` of ${file.versionCount}` : ''}
                    </td>
                    <td className="admin__numeric">
                      {file.sizeBytes ? `${Math.ceil(file.sizeBytes / 1024)} KB` : '—'}
                    </td>
                    <td>{file.isPublic ? 'Yes' : 'No'}</td>
                    <td>
                      <div className="admin__actions">
                        {file.kind === 'FILE' && file.isPublic ? (
                          <a
                            className="admin__button admin__button--secondary"
                            href={`/f/${publicId}/${file.key}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Preview
                          </a>
                        ) : null}
                        <ActionButton
                          action={toggleVisibility.bind(
                            null,
                            businessId,
                            file.id,
                            publicId,
                            !file.isPublic,
                          )}
                          label={file.isPublic ? 'Unpublish' : 'Publish'}
                        />
                        <ActionButton
                          action={deleteFile.bind(null, businessId, file.id, publicId)}
                          label="Remove"
                          variant="danger"
                          confirm={`Remove ${file.key} and every stored version?`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Upload or replace a PDF</h2>
        <p className="admin__hint">
          Reusing an existing key uploads a new version and keeps the old one. Only the current
          version is ever served.
        </p>
        <ActionForm action={uploadFile} submitLabel="Upload">
          <div className="admin__grid">
            <TextField name="key" label="Key" hint="e.g. main-menu, drinks, price-list" required />
            <TextField name="titleAr" label="Title (Arabic)" dir="rtl" required />
            <TextField name="titleEn" label="Title (English)" />
            <TextField name="sortOrder" label="Sort order" defaultValue="0" />
          </div>
          <Field label="PDF file" hint="PDF only, up to 25MB">
            {(id) => (
              <input
                id={id}
                name="file"
                type="file"
                accept="application/pdf"
                className="admin__input"
                required
              />
            )}
          </Field>
          <div className="admin__grid">
            <CheckboxField
              name="isPublic"
              label="Show on the public profile"
              defaultChecked
            />
            <CheckboxField
              name="allowDownload"
              label="Allow download"
              defaultChecked
              hint="Off means visitors view it in the browser instead."
            />
          </div>
        </ActionForm>
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Link an externally hosted menu</h2>
        <p className="admin__hint">
          For a business whose menu already lives elsewhere. The link is offered from the
          profile; it never replaces the permanent QR destination.
        </p>
        <ActionForm action={createLink} submitLabel="Save link">
          <div className="admin__grid">
            <TextField name="key" label="Key" required />
            <TextField name="titleAr" label="Title (Arabic)" dir="rtl" required />
            <TextField name="titleEn" label="Title (English)" />
            <TextField name="externalUrl" label="URL" required />
            <TextField name="sortOrder" label="Sort order" defaultValue="0" />
          </div>
          <CheckboxField name="isPublic" label="Show on the public profile" defaultChecked />
        </ActionForm>
      </section>
    </>
  );
}
