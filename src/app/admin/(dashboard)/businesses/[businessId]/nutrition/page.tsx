import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getNutritionReadiness } from '@/server/nutrition/service';
import { READINESS_DISCLAIMER } from '@/server/nutrition/readiness';
import { TenantAccessError } from '@/server/tenancy/context';

export const dynamic = 'force-dynamic';

const OVERALL_LABEL: Record<string, string> = {
  COMPLETE: 'Complete',
  PARTIAL: 'Partial',
  MISSING: 'Missing',
  NEEDS_REVIEW: 'Needs review',
};

/**
 * Nutrition and compliance readiness (§05, §105–§107).
 *
 * Reports what the business has supplied. It does not, anywhere, state whether
 * the business meets a requirement — that depends on the menu, the premises and
 * an inspector, none of which this platform can see. The disclaimer is rendered
 * unconditionally for the same reason.
 */
export default async function NutritionPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();

  const report = await getNutritionReadiness(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Nutrition readiness</h1>
          <p className="admin__subtitle">
            {report.businessName} ·{' '}
            <Link href={`/admin/businesses/${businessId}`}>Back to business</Link>
          </p>
        </div>
        {report.applies ? (
          <p className="admin__score" data-readiness={report.overall}>
            <strong>{OVERALL_LABEL[report.overall]}</strong>
            <span className="admin__hint">
              {report.itemsComplete} of {report.itemsTotal} items fully described
            </span>
          </p>
        ) : null}
      </header>

      {!report.applies ? (
        <section className="admin__panel">
          <p className="admin__message admin__message--ok" role="status">
            This business is not a food business, so no nutrition information is expected.
          </p>
        </section>
      ) : (
        <>
          <section className="admin__panel">
            <p className="admin__message" role="note">
              {READINESS_DISCLAIMER}
            </p>
          </section>

          <section className="admin__panel">
            <h2 className="admin__panel-title">What has been supplied</h2>
            <ul className="admin__checklist">
              {report.coverage.map((field) => (
                <li
                  key={field.key}
                  data-field={field.key}
                  data-status={
                    field.provided === report.itemsTotal && report.itemsTotal > 0
                      ? 'PASS'
                      : field.provided === 0
                        ? field.core
                          ? 'ERROR'
                          : 'INFO'
                        : 'WARNING'
                  }
                >
                  <span className="admin__checklist-mark">
                    {field.provided === report.itemsTotal && report.itemsTotal > 0 ? '✓' : '·'}
                  </span>
                  <span className="admin__checklist-label">
                    {field.label}
                    {field.core ? ' *' : ''}
                  </span>
                  <span className="admin__hint">
                    {field.provided} of {report.itemsTotal} items
                  </span>
                </li>
              ))}
            </ul>
            <p className="admin__hint">
              * Asked of every food item. The rest are supplied when the business has them.
              Nothing on this page is estimated or filled in by the platform.
            </p>
          </section>

          {report.needsReview.length > 0 ? (
            <section className="admin__panel">
              <h2 className="admin__panel-title">
                Items to look at ({report.needsReview.length})
              </h2>
              <div className="admin__table-scroll">
                <table className="admin__table">
                  <thead>
                    <tr>
                      <th scope="col">Code</th>
                      <th scope="col">Item</th>
                      <th scope="col">Not yet supplied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.needsReview.map((item) => (
                      <tr key={item.itemCode} data-needs-nutrition={item.itemCode}>
                        <td>
                          <code>{item.itemCode}</code>
                        </td>
                        <td>{item.name}</td>
                        <td>{item.missingCore.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="admin__hint">
                <Link href={`/admin/businesses/${businessId}/data`}>
                  Export the menu, fill these in, and import it back
                </Link>{' '}
                — usually faster than editing each item.
              </p>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
