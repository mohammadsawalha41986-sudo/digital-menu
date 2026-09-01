import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getProfileHealth } from '@/server/quality/service';
import { TenantAccessError } from '@/server/tenancy/context';

export const dynamic = 'force-dynamic';

const AREA_LABELS: Record<string, string> = {
  brand: 'Brand',
  content: 'Content',
  menu: 'Menu',
  images: 'Images',
  nutrition: 'Nutrition',
  links: 'Links',
  contact: 'Contact',
  hours: 'Opening hours',
  seo: 'SEO',
  qr: 'QR',
  downloads: 'Downloads',
  publishing: 'Publishing',
};

const STATUS_MARK: Record<string, string> = {
  PASS: '✓',
  INFO: 'i',
  WARNING: '!',
  ERROR: '×',
};

/**
 * Profile Health (master spec §06, §07, §08, §74).
 *
 * The screen an operator opens before publishing, and the one the dashboard
 * sends them to when something needs attention.
 *
 * Three deliberate choices:
 *  - Errors are separated from warnings and notes, and only errors are called
 *    blocking. A gate that treats a missing English description like a missing
 *    price is a gate people learn to ignore (§07).
 *  - Every finding carries a Fix link straight to the screen that resolves it.
 *  - Missing nutrition is reported as missing *data*, never as non-compliance,
 *    and no figure is ever invented (§107; GOALS I9).
 */
export default async function HealthPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();

  const report = await getProfileHealth(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const groups = [
    { severity: 'ERROR' as const, title: 'Must fix', hint: 'These stop the profile working as intended.' },
    { severity: 'WARNING' as const, title: 'Should review', hint: 'Publishable, but worth a look first.' },
    { severity: 'INFO' as const, title: 'Could improve', hint: 'Optional.' },
  ];

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Profile health</h1>
          <p className="admin__subtitle">
            {report.businessName} ·{' '}
            <Link href={`/admin/businesses/${businessId}`}>Back to business</Link>
          </p>
        </div>
        <p
          className={`admin__score ${report.blocked ? 'admin__score--blocked' : ''}`}
          data-health-score={report.score}
        >
          <strong>{report.score}%</strong>
          <span className="admin__hint">
            {report.errors} must fix · {report.warnings} to review · {report.infos} optional
          </span>
        </p>
      </header>

      <section className="admin__panel">
        <h2 className="admin__panel-title">By area</h2>
        <ul className="admin__checklist">
          {report.byArea.map((area) => (
            <li key={area.area} data-area={area.area} data-status={area.status}>
              <span className="admin__checklist-mark">{STATUS_MARK[area.status]}</span>
              <span className="admin__checklist-label">{AREA_LABELS[area.area] ?? area.area}</span>
              <span className="admin__hint">
                {area.status === 'PASS'
                  ? 'Nothing outstanding'
                  : `${area.findings.length} item${area.findings.length === 1 ? '' : 's'}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {groups.map((group) => {
        const findings = report.findings.filter((finding) => finding.severity === group.severity);
        if (findings.length === 0) return null;

        return (
          <section className="admin__panel" key={group.severity} data-severity={group.severity}>
            <h2 className="admin__panel-title">
              {group.title} ({findings.length})
            </h2>
            <p className="admin__hint">{group.hint}</p>

            <ul className="admin__findings">
              {findings.map((finding) => (
                <li key={finding.code} data-finding={finding.code}>
                  <span className="admin__finding-area">
                    {AREA_LABELS[finding.area] ?? finding.area}
                  </span>
                  <span className="admin__finding-message">{finding.message}</span>
                  {finding.fixPath ? (
                    <Link href={finding.fixPath} className="admin__button admin__button--secondary">
                      Fix
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {report.findings.length === 0 ? (
        <section className="admin__panel">
          <p className="admin__message admin__message--ok" role="status">
            Nothing outstanding. This profile is ready to publish.
          </p>
        </section>
      ) : null}
    </>
  );
}
