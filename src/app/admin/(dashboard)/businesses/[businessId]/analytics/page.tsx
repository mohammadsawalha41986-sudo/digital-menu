import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { TIME_RANGES, buildReport, type TimeRange } from '@/server/analytics/report';

export const dynamic = 'force-dynamic';

const RANGE_VALUES = TIME_RANGES.map((range) => range.value);

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const requested = typeof query.range === 'string' ? query.range : '30d';
  const range: TimeRange = (RANGE_VALUES as string[]).includes(requested)
    ? (requested as TimeRange)
    : '30d';

  const report = await buildReport(user, businessId, range);

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Analytics</h1>
          <p className="admin__subtitle">
            Counts of recorded events. No personal data is stored — visitors are counted with a
            salted hash that rotates daily and cannot be reversed or linked across businesses.
          </p>
        </div>
        <Link
          href={`/admin/businesses/${business.id}`}
          className="admin__button admin__button--secondary"
        >
          Back to business
        </Link>
      </header>

      <nav className="admin__actions" aria-label="Time range">
        {TIME_RANGES.map((option) => (
          <Link
            key={option.value}
            href={`?range=${option.value}`}
            className={`admin__button ${range === option.value ? '' : 'admin__button--secondary'}`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {report.empty ? (
        <section className="admin__panel">
          <p className="admin__empty">
            Nothing recorded in this period. Figures appear here once the profile is visited —
            they are never estimated.
          </p>
        </section>
      ) : (
        <>
          <section className="admin__cards" aria-label="Overview">
            <Metric label="Profile views" value={report.profileViews} />
            <Metric label="Unique visitors (daily)" value={report.uniqueVisitors} />
            <Metric label="QR scans" value={report.qrScans} />
            <Metric label="Total events" value={report.totalEvents} />
          </section>

          <div className="admin__cards">
            <Breakdown title="Events" rows={report.byEventType.map((r) => ({ key: r.eventType, count: r.count }))} />
            <Breakdown title="Top items" rows={report.topItems} />
            <Breakdown title="Top categories" rows={report.topCategories} />
            <Breakdown title="Devices" rows={report.byDevice.map((r) => ({ key: r.device, count: r.count }))} />
            <Breakdown title="Languages" rows={report.byLocale.map((r) => ({ key: r.locale, count: r.count }))} />
          </div>
        </>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin__card">
      <span className="admin__metric">{value}</span>
      <span className="admin__metric-label">{label}</span>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { key: string; count: number }[] }) {
  return (
    <div className="admin__panel">
      <h2 className="admin__panel-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="admin__empty">Nothing recorded.</p>
      ) : (
        <table className="admin__table">
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.key || '—'}</td>
                <td className="admin__numeric">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
