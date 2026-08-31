import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getAuditLog, getPriceHistory } from '@/server/history/service';
import { TenantAccessError } from '@/server/tenancy/context';
import { formatMinorAsDecimal } from '@/lib/money';

export const dynamic = 'force-dynamic';

/**
 * Price history and the audit log (master spec §146, §147).
 *
 * Both were written and never read. Price history had no reader at all; the
 * audit log surfaced as eight rows on the dashboard with no filter, no paging
 * and no before-and-after values.
 *
 * Prices lead, because that is the question actually asked — "who changed this
 * price, and to what?" — and the audit log answers the broader one beneath it.
 */
export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const user = await requireUser();

  const itemCode = typeof query.item === 'string' ? query.item : null;
  const action = typeof query.action === 'string' ? query.action : null;
  const page = Number(query.page ?? 1);

  const [prices, audit] = await Promise.all([
    getPriceHistory(user, businessId, { itemCode, page: Number.isFinite(page) ? page : 1 }).catch(
      (error) => {
        if (error instanceof TenantAccessError) notFound();
        throw error;
      },
    ),
    getAuditLog(user, businessId, { action }),
  ]);

  const money = (minor: number | null, currency: string) =>
    minor === null ? '—' : `${formatMinorAsDecimal(minor, currency)} ${currency}`;

  const base = `/admin/businesses/${businessId}/history`;

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">History</h1>
          <p className="admin__subtitle">
            Who changed what, and when.{' '}
            <Link href={`/admin/businesses/${businessId}`}>Back to business</Link>
          </p>
        </div>
      </header>

      <section className="admin__panel">
        <h2 className="admin__panel-title">
          Price changes {itemCode ? `— ${itemCode}` : ''} ({prices.total})
        </h2>

        {itemCode ? (
          <p className="admin__hint">
            <Link href={base}>Show every item</Link>
          </p>
        ) : null}

        {prices.rows.length === 0 ? (
          <p className="admin__empty">
            No price has changed yet. Changes made through the menu editor, bulk edit or an
            import are recorded here.
          </p>
        ) : (
          <>
            <div className="admin__table-scroll">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Item</th>
                    <th scope="col" className="admin__numeric">From</th>
                    <th scope="col" className="admin__numeric">To</th>
                    <th scope="col">By</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.rows.map((row) => (
                    <tr key={row.id} data-price-history={row.itemCode}>
                      <td>{row.createdAt.toLocaleString('en-GB')}</td>
                      <td>
                        <Link href={`${base}?item=${encodeURIComponent(row.itemCode)}`}>
                          {row.itemName ?? row.itemCode}
                        </Link>
                        <span className="admin__hint"> {row.itemCode}</span>
                      </td>
                      <td className="admin__numeric">{money(row.oldPriceMinor, row.currency)}</td>
                      <td className="admin__numeric">
                        <strong>{money(row.newPriceMinor, row.currency)}</strong>
                      </td>
                      <td>
                        {row.changedBy ?? 'Import'}
                        {row.batchId ? <span className="admin__hint"> · batch</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {prices.pages > 1 ? (
              <nav className="admin__actions" aria-label="Price history pages">
                {prices.page > 1 ? (
                  <Link
                    href={`${base}?page=${prices.page - 1}${itemCode ? `&item=${itemCode}` : ''}`}
                    className="admin__button admin__button--secondary"
                  >
                    Previous
                  </Link>
                ) : null}
                <span className="admin__hint">
                  Page {prices.page} of {prices.pages}
                </span>
                {prices.page < prices.pages ? (
                  <Link
                    href={`${base}?page=${prices.page + 1}${itemCode ? `&item=${itemCode}` : ''}`}
                    className="admin__button admin__button--secondary"
                  >
                    Next
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Activity ({audit.total})</h2>

        {audit.availableActions.length > 0 ? (
          <nav className="admin__actions" aria-label="Filter activity">
            <Link
              href={base}
              className={`admin__button ${action ? 'admin__button--secondary' : ''}`}
            >
              Everything
            </Link>
            {audit.availableActions.slice(0, 12).map((entry) => (
              <Link
                key={entry.action}
                href={`${base}?action=${encodeURIComponent(entry.action)}`}
                className={`admin__button ${
                  action === entry.action ? '' : 'admin__button--secondary'
                }`}
              >
                {entry.action} ({entry.count})
              </Link>
            ))}
          </nav>
        ) : null}

        {audit.rows.length === 0 ? (
          <p className="admin__empty">Nothing recorded yet.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Action</th>
                  <th scope="col">By</th>
                  <th scope="col">What changed</th>
                </tr>
              </thead>
              <tbody>
                {audit.rows.map((row) => (
                  <tr key={row.id} data-audit={row.action}>
                    <td>{row.createdAt.toLocaleString('en-GB')}</td>
                    <td>
                      <code>{row.action}</code>
                    </td>
                    <td>{row.user ?? 'System'}</td>
                    <td>
                      {row.changes.length > 0 ? (
                        <ul className="admin__changes">
                          {row.changes.map((change) => (
                            <li key={change.field}>
                              {change.field}: {change.from ?? '—'} → <strong>{change.to ?? '—'}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : row.details.length > 0 ? (
                        <span className="admin__hint">
                          {row.details.map((detail) => `${detail.key}: ${detail.value}`).join(', ')}
                        </span>
                      ) : (
                        <span className="admin__hint">—</span>
                      )}
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
