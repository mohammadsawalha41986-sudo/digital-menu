import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import {
  getBusinessForAdmin,
  getMenuVersions,
  getPendingChanges,
} from '@/server/admin/business-service';
import { restoreMenuVersionAction } from '@/server/admin/actions';
import { TenantAccessError } from '@/server/tenancy/context';
import { formatMinorAsDecimal } from '@/lib/money';
import { RestoreButton } from './restore-button';

export const dynamic = 'force-dynamic';

/**
 * Version history, and the draft-versus-live comparison (§10, §84, §85).
 *
 * Two questions, answered on one screen because an operator asks them
 * together: *what will publishing change?* and *what did the last publish
 * change, and can I go back?*
 *
 * The comparison is written in the terms the change was made in — "38.00 →
 * 42.00 SAR", not a field-level object diff. A technically impressive diff
 * that a staff member cannot read is a diff nobody uses.
 */
export default async function VersionsPage({
  params,
}: {
  params: Promise<{ businessId: string; menuId: string }>;
}) {
  const { businessId, menuId } = await params;
  const user = await requireUser();

  const [history, pending] = await Promise.all([
    getMenuVersions(user, businessId, menuId).catch((error) => {
      if (error instanceof TenantAccessError) notFound();
      throw error;
    }),
    getPendingChanges(user, businessId, menuId).catch(() => null),
  ]);

  // Needed to invalidate the public profile after a restore.
  const business = await getBusinessForAdmin(user, businessId);
  const publicId = business.publicId;

  const { menu, versions } = history;
  const diff = pending?.diff;

  const price = (minor: number | null, currency: string) =>
    minor === null ? '—' : `${formatMinorAsDecimal(minor, currency)} ${currency}`;

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Version history</h1>
          <p className="admin__subtitle">
            {menu.titleEn ?? menu.titleAr} ·{' '}
            <Link href={`/admin/businesses/${businessId}/menus`}>Back to menus</Link>
          </p>
        </div>
      </header>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Draft compared with live</h2>

        {!pending ? (
          <p className="admin__empty">This menu has not been published yet.</p>
        ) : !pending.hasChanges ? (
          <p className="admin__message admin__message--ok" role="status">
            The draft matches what is live. Publishing now would change nothing.
          </p>
        ) : (
          <>
            <p className="admin__hint">
              Publishing will apply the following. The public URL and the QR code do not
              change.
            </p>

            {diff && diff.priceChanges.length > 0 ? (
              <div className="admin__table-scroll">
                <table className="admin__table">
                  <caption className="admin__label">Prices</caption>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col" className="admin__numeric">Now live</th>
                      <th scope="col" className="admin__numeric">After publishing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.priceChanges.map((change) => (
                      <tr key={change.itemCode} data-price-change={change.itemCode}>
                        <td>{change.nameEn ?? change.nameAr}</td>
                        <td className="admin__numeric">{price(change.from, change.currency)}</td>
                        <td className="admin__numeric">
                          <strong>{price(change.to, change.currency)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {diff && diff.itemsAdded.length > 0 ? (
              <p className="admin__hint">
                <strong>Added:</strong>{' '}
                {diff.itemsAdded.map((item) => item.nameEn ?? item.nameAr).join(', ')}
              </p>
            ) : null}

            {diff && diff.itemsRemoved.length > 0 ? (
              <p className="admin__hint">
                <strong>Removed:</strong>{' '}
                {diff.itemsRemoved.map((item) => item.nameEn ?? item.nameAr).join(', ')}
              </p>
            ) : null}

            {diff && diff.fieldChanges.length > 0 ? (
              <div className="admin__table-scroll">
                <table className="admin__table">
                  <caption className="admin__label">Other changes</caption>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">What</th>
                      <th scope="col">From</th>
                      <th scope="col">To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.fieldChanges.map((change, index) => (
                      <tr key={`${change.itemCode}-${change.field}-${index}`}>
                        <td>{change.nameEn ?? change.nameAr}</td>
                        <td>{change.field}</td>
                        <td>{change.fromLabel ?? '—'}</td>
                        <td>{change.toLabel ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {diff?.designChanged ? <p className="admin__hint">The menu design changed.</p> : null}
          </>
        )}
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Published versions</h2>

        {versions.length === 0 ? (
          <p className="admin__empty">Nothing has been published yet.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Published</th>
                  <th scope="col">By</th>
                  <th scope="col">Changes</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => {
                  const summary = version.summary ?? {};
                  const parts: string[] = [];
                  const count = (key: string) => Number(summary[key] ?? 0);

                  if (count('itemsAdded')) parts.push(`+${count('itemsAdded')} items`);
                  if (count('itemsRemoved')) parts.push(`−${count('itemsRemoved')} items`);
                  if (count('pricesChanged')) parts.push(`~${count('pricesChanged')} prices`);
                  if (count('imagesChanged')) parts.push(`~${count('imagesChanged')} images`);
                  if (count('otherChanges')) parts.push(`~${count('otherChanges')} other`);
                  if (summary.designChanged) parts.push('design');

                  return (
                    <tr key={version.id} data-version={version.version}>
                      <th scope="row">
                        v{version.version}
                        {version.isLive ? <span className="admin__badge"> live</span> : null}
                        {version.restoredFromVersion !== null ? (
                          <span className="admin__hint">
                            {' '}
                            restored v{version.restoredFromVersion}
                          </span>
                        ) : null}
                      </th>
                      <td>
                        {version.publishedAt
                          ? new Date(version.publishedAt).toLocaleString('en-GB')
                          : '—'}
                      </td>
                      <td>{version.publishedBy ?? '—'}</td>
                      <td>{parts.length > 0 ? parts.join(', ') : 'No content change'}</td>
                      <td>
                        {version.isLive ? (
                          <span className="admin__hint">Currently live</span>
                        ) : version.restorable ? (
                          <RestoreButton
                            action={restoreMenuVersionAction.bind(
                              null,
                              businessId,
                              publicId,
                              menuId,
                              version.id,
                            )}
                            version={version.version}
                          />
                        ) : (
                          <span className="admin__hint">
                            Published before snapshots — cannot be restored
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
