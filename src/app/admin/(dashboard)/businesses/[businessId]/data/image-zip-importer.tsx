'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/server/admin/actions';
import type { ImageZipPreviewState } from '@/server/admin/image-import-actions';

export function ImageZipImporter({
  preview,
  confirm,
}: {
  preview: (previous: ImageZipPreviewState, formData: FormData) => Promise<ImageZipPreviewState>;
  confirm: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [previewState, previewAction] = useActionState<ImageZipPreviewState, FormData>(preview, {});
  const [confirmState, confirmAction] = useActionState<ActionState, FormData>(confirm, {});
  const result = previewState.preview;

  return (
    <section className="admin__panel" data-image-zip-import="">
      <h2 className="admin__panel-title">Bulk item photography</h2>
      <p className="admin__hint">
        Name each image after the stable <code>item_id</code> in your spreadsheet, for example{' '}
        <code>BURGER-001.jpg</code>, then place the images in a ZIP. Preview is read-only; nothing is
        uploaded until you confirm.
      </p>

      <form action={previewAction} className="admin__form">
        {previewState.error ? (
          <p className="admin__message admin__message--error" role="alert">
            {previewState.error}
          </p>
        ) : null}
        <div className="admin__field">
          <label className="admin__label" htmlFor="image-zip-preview">
            Images ZIP
          </label>
          <input
            id="image-zip-preview"
            name="imageZip"
            type="file"
            accept=".zip,application/zip"
            className="admin__input"
            required
          />
          <span className="admin__hint">
            JPG, PNG and WebP only. Maximum archive 100MB, maximum 500 entries. Unsafe paths,
            encrypted entries and suspicious compression are rejected.
          </span>
        </div>
        <div className="admin__actions">
          <PendingButton label="Preview image matches" pendingLabel="Checking ZIP…" />
        </div>
      </form>

      {result ? (
        <div data-image-zip-preview="">
          <div className="admin__cards" aria-label="Image ZIP preview">
            <p className="admin__card">
              <strong>{result.imageCount}</strong>
              <span>Images</span>
            </p>
            <p className="admin__card">
              <strong>{result.matchedCount}</strong>
              <span>Matched</span>
            </p>
            <p className="admin__card">
              <strong>{result.replacedCount}</strong>
              <span>Replace a photo</span>
            </p>
            <p className="admin__card">
              <strong>{result.unmatchedCount}</strong>
              <span>Unmatched</span>
            </p>
          </div>

          {result.matches.length > 0 ? (
            <div className="admin__table-scroll">
              <table className="admin__table">
                <caption className="admin__label">Images that will be assigned</caption>
                <thead>
                  <tr>
                    <th scope="col">Image</th>
                    <th scope="col">item_id</th>
                    <th scope="col">Menu item</th>
                    <th scope="col">Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matches.map((match) => (
                    <tr key={`${match.itemCode}-${match.fileName}`}>
                      <td>{match.fileName}</td>
                      <td><code>{match.itemCode}</code></td>
                      <td>{match.itemName}</td>
                      <td>{match.replaces ? 'Replaces the current photo' : 'Adds a first photo'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {result.unmatched.length > 0 ? (
            <details>
              <summary className="admin__label">
                Unmatched filenames ({result.unmatchedCount}) — skipped, and the items they name
                keep whatever photograph they already have
              </summary>
              <ul className="admin__findings">
                {result.unmatched.map((row) => (
                  <li key={row.fileName}>
                    <span className="admin__finding-area"><code>{row.itemCode}</code></span>
                    <span className="admin__finding-message">{row.fileName}</span>
                  </li>
                ))}
              </ul>
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
            <input type="hidden" name="expectedDigest" value={result.digest} />
            <div className="admin__field">
              <label className="admin__label" htmlFor="image-zip-confirm">
                Confirm with the same ZIP
              </label>
              <input
                id="image-zip-confirm"
                name="imageZip"
                type="file"
                accept=".zip,application/zip"
                className="admin__input"
                required
              />
              <span className="admin__hint">
                The archive fingerprint must match this preview, so a different ZIP cannot be imported accidentally.
              </span>
            </div>
            <div className="admin__actions">
              <PendingButton
                label={`Assign ${result.matchedCount} images`}
                pendingLabel="Uploading images…"
                disabled={result.matchedCount === 0}
              />
            </div>
          </form>
        </div>
      ) : null}
    </section>
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
