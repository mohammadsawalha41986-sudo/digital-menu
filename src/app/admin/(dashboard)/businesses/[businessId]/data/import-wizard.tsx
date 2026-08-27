'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/server/admin/actions';
import type { ImportPreviewState } from '@/server/admin/import-actions';

/**
 * Two-step import: preview, then confirm.
 *
 * The preview step performs no writes. Nothing reaches the database until an
 * operator has seen the parsed rows, the detected column mapping and every
 * problem the file contains (master spec §58, §61).
 */
export function ImportWizard({
  businessId,
  publicId,
  menuKeys,
  preview,
  confirm,
}: {
  businessId: string;
  publicId: string;
  menuKeys: string[];
  preview: (previous: ImportPreviewState, formData: FormData) => Promise<ImportPreviewState>;
  confirm: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [previewState, previewAction] = useActionState<ImportPreviewState, FormData>(preview, {});
  const [confirmState, confirmAction] = useActionState<ActionState, FormData>(confirm, {});

  const result = previewState.preview;
  const blocked = (result?.missingRequiredColumns.length ?? 0) > 0;

  return (
    <>
      <section className="admin__panel">
        <h2 className="admin__panel-title">Import a spreadsheet</h2>
        <p className="admin__hint">
          Nothing is written until you confirm the preview below.
        </p>

        <form action={previewAction} className="admin__form">
          {previewState.error ? (
            <p className="admin__message admin__message--error" role="alert">
              {previewState.error}
            </p>
          ) : null}

          <div className="admin__field">
            <label className="admin__label" htmlFor="import-file">
              File (.xlsx or .csv)
            </label>
            <input
              id="import-file"
              name="file"
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="admin__input"
              required
            />
          </div>

          <div className="admin__actions">
            <PendingButton label="Preview" pendingLabel="Reading…" />
          </div>
        </form>
      </section>

      {result ? (
        <section className="admin__panel" data-import-preview="">
          <h2 className="admin__panel-title">Preview — {result.fileName}</h2>

          <p
            className={`admin__message admin__message--${blocked ? 'error' : 'ok'}`}
            role="status"
          >
            {blocked
              ? `Required columns missing: ${result.missingRequiredColumns.join(', ')}`
              : `${result.validCount} rows ready to import, ${result.invalidCount} with problems.`}
          </p>

          <div>
            <h3 className="admin__label">Detected columns</h3>
            <p className="admin__hint">
              {result.headers
                .map((header, index) => `${header} → ${result.mapping[index] ?? '(ignored)'}`)
                .join(' · ')}
            </p>
          </div>

          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Category</th>
                  <th scope="col">Item</th>
                  <th scope="col" className="admin__numeric">Price</th>
                  <th scope="col" className="admin__numeric">Calories</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.sample.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{row.category}</td>
                    <td>{row.name}</td>
                    <td className="admin__numeric">{row.price || '—'}</td>
                    <td className="admin__numeric">{row.calories || '—'}</td>
                    <td>{row.valid ? 'Valid' : (row.problem ?? 'Problem')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.issues.length > 0 ? (
            <details>
              <summary className="admin__label">
                {result.issues.length} problems — row, column, value, fix
              </summary>
              <div className="admin__table-scroll">
                <table className="admin__table">
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">Column</th>
                      <th scope="col">Value</th>
                      <th scope="col">Problem</th>
                      <th scope="col">Suggested fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.issues.map((issue, index) => (
                      <tr key={`${issue.rowNumber}-${issue.column}-${index}`}>
                        <td>{issue.rowNumber}</td>
                        <td>{issue.column}</td>
                        <td>{issue.value || '—'}</td>
                        <td>{issue.problem}</td>
                        <td>{issue.suggestion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}

          <form action={confirmAction} className="admin__form">
            {confirmState.error ? (
              <p className="admin__message admin__message--error" role="alert">
                {confirmState.error}
              </p>
            ) : null}
            {confirmState.ok && confirmState.message ? (
              <p className="admin__message admin__message--ok" role="status">
                {confirmState.message}
              </p>
            ) : null}

            <input type="hidden" name="payload" value={result.payload} />
            <input type="hidden" name="fileName" value={result.fileName} />
            <input type="hidden" name="businessId" value={businessId} />
            <input type="hidden" name="publicId" value={publicId} />

            <div className="admin__grid">
              <div className="admin__field">
                <label className="admin__label" htmlFor="import-menu">
                  Import into menu
                </label>
                <select id="import-menu" name="menuKey" className="admin__select">
                  {menuKeys.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
                <span className="admin__hint">
                  Rows with their own menu column override this.
                </span>
              </div>

              <div className="admin__field">
                <label className="admin__label" htmlFor="import-duplicates">
                  When an item code already exists
                </label>
                <select
                  id="import-duplicates"
                  name="duplicateStrategy"
                  className="admin__select"
                  defaultValue="update"
                >
                  <option value="update">Update the existing item</option>
                  <option value="skip">Skip the row</option>
                </select>
              </div>
            </div>

            <div className="admin__actions">
              <PendingButton
                label={`Import ${result.validCount} rows`}
                pendingLabel="Importing…"
                disabled={blocked || result.validCount === 0}
              />
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}

function PendingButton({
  label,
  pendingLabel,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="admin__button" disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </button>
  );
}
