'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/server/admin/actions';
import type { ImportPreviewState } from '@/server/admin/import-actions';

/**
 * Two-step import: preview, then confirm.
 *
 * The preview step performs no writes. Nothing reaches the database until an
 * operator has seen the parsed rows, the detected column mapping and every
 * problem the file contains (master spec §58, §61).
 *
 * What the preview shows is what the import will *do* — new, updated,
 * unchanged and failed, with each price move in full (§15) — because a count
 * of valid rows says whether the file parses, not whether importing it is a
 * good idea. Conflicts are listed separately (§16), and the detected mapping
 * is editable rather than merely displayed (§14).
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
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

            {/* Drag and drop, with the file input kept as the real control so
                the form still works with a keyboard and with no JavaScript. */}
            <div
              className={`admin__dropzone ${dragging ? 'admin__dropzone--active' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const dropped = event.dataTransfer.files?.[0];
                if (dropped && fileInput.current) {
                  const transfer = new DataTransfer();
                  transfer.items.add(dropped);
                  fileInput.current.files = transfer.files;
                  setFileName(dropped.name);
                }
              }}
            >
              <p>
                {fileName ? (
                  <strong>{fileName}</strong>
                ) : (
                  'Drop a spreadsheet here, or choose one below.'
                )}
              </p>
              <input
                ref={fileInput}
                id="import-file"
                name="file"
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="admin__input"
                required
                onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
              />
            </div>
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

          {/* The change summary comes first: it is the question being asked. */}
          <div className="admin__cards" aria-label="What this import will do">
            <p className="admin__card">
              <strong>{result.plan.counts.create}</strong>
              <span>New</span>
            </p>
            <p className="admin__card">
              <strong>{result.plan.counts.update}</strong>
              <span>Updated</span>
            </p>
            <p className="admin__card">
              <strong>{result.plan.counts.unchanged}</strong>
              <span>Unchanged</span>
            </p>
            <p className="admin__card">
              <strong>{result.plan.counts.error}</strong>
              <span>Errors</span>
            </p>
          </div>

          {result.plan.conflicts.length > 0 ? (
            <div data-import-conflicts="">
              <h3 className="admin__label">Worth resolving first</h3>
              <ul className="admin__findings">
                {result.plan.conflicts.map((conflict) => (
                  <li key={`${conflict.kind}-${conflict.subject}`} data-conflict={conflict.kind}>
                    <span className="admin__finding-area">
                      {conflict.kind === 'duplicate_in_file'
                        ? 'Duplicate'
                        : conflict.kind === 'category_new'
                          ? 'New category'
                          : 'No item code'}
                    </span>
                    <span className="admin__finding-message">
                      <strong>{conflict.subject}</strong> — {conflict.detail}
                      {conflict.rows.length > 0 ? (
                        <span className="admin__hint"> Rows {conflict.rows.join(', ')}.</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.plan.priceChanges.length > 0 ? (
            <div className="admin__table-scroll" data-import-price-changes="">
              <table className="admin__table">
                <caption className="admin__label">Prices that will change</caption>
                <thead>
                  <tr>
                    <th scope="col">Row</th>
                    <th scope="col">Item</th>
                    <th scope="col" className="admin__numeric">Now</th>
                    <th scope="col" className="admin__numeric">After import</th>
                  </tr>
                </thead>
                <tbody>
                  {result.plan.priceChanges.map((change) => (
                    <tr key={change.rowNumber}>
                      <td>{change.rowNumber}</td>
                      <td>{change.name}</td>
                      <td className="admin__numeric">{change.from}</td>
                      <td className="admin__numeric">
                        <strong>{change.to}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {result.plan.updates.length > 0 ? (
            <details>
              <summary className="admin__label">
                Other fields being updated ({result.plan.updates.length} items)
              </summary>
              <ul className="admin__findings">
                {result.plan.updates.map((update) => (
                  <li key={update.rowNumber}>
                    <span className="admin__finding-area">Row {update.rowNumber}</span>
                    <span className="admin__finding-message">
                      {update.name} — {update.changes.join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {/* Re-previewing with a corrected mapping re-reads the same file
              through the operator's choices instead of the guess (§14). */}
          <form action={previewAction} className="admin__form" data-import-mapping="">
            <h3 className="admin__label">Detected columns</h3>
            <p className="admin__hint">
              Change anything that was read wrongly, choose the file again, and preview
              once more.
            </p>

            <div className="admin__table-scroll">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th scope="col">Column in your file</th>
                    <th scope="col">Imported as</th>
                  </tr>
                </thead>
                <tbody>
                  {result.headers.map((header, index) => (
                    <tr key={`${header}-${index}`}>
                      <td>
                        <code>{header}</code>
                      </td>
                      <td>
                        <select
                          name={`map_${index}`}
                          className="admin__select"
                          defaultValue={result.mapping[index] ?? ''}
                          aria-label={`Import ${header} as`}
                        >
                          <option value="">(ignore this column)</option>
                          {result.availableColumns.map((column) => (
                            <option key={column.key} value={column.key}>
                              {column.label}
                              {column.required ? ' *' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin__field">
              <label className="admin__label" htmlFor="remap-file">
                The same file again
              </label>
              <input
                id="remap-file"
                name="file"
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="admin__input"
                required
              />
            </div>

            <div className="admin__actions">
              <PendingButton label="Preview with this mapping" pendingLabel="Reading…" />
            </div>
          </form>

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
