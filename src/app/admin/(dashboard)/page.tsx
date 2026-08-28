import Link from 'next/link';
import { requireUser } from '@/server/auth/current-user';
import { prisma } from '@/server/db/client';
import { listBusinessesForUser } from '@/server/admin/business-service';

/**
 * Dashboard home (master spec §19).
 *
 * Every number on this page is a live `count` against the database, scoped to
 * what the acting user may see. None is hard-coded and none is estimated — a
 * dashboard that invents figures is worse than one showing a small true number,
 * because staff quote these to clients.
 */

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const businesses = await listBusinessesForUser(user);

  const visibleIds = businesses.map((business) => business.id);

  const [activeProfiles, branches, menus, items, profileViews, qrScans, recentAudits] =
    await Promise.all([
    prisma.business.count({ where: { id: { in: visibleIds }, status: 'ACTIVE' } }),
    prisma.branch.count({ where: { businessId: { in: visibleIds } } }),
    prisma.menu.count({ where: { businessId: { in: visibleIds }, status: 'ACTIVE' } }),
    prisma.menuItem.count({ where: { businessId: { in: visibleIds } } }),
    prisma.analyticsEvent.count({
      where: {
        businessId: { in: visibleIds },
        eventType: { in: ['profile_view', 'branch_view'] },
      },
    }),
    prisma.analyticsEvent.count({
      where: { businessId: { in: visibleIds }, eventType: 'qr_scan' },
    }),
    prisma.auditLog.findMany({
      where: { businessId: { in: visibleIds } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        action: true,
        entity: true,
        createdAt: true,
        business: { select: { nameEn: true, nameAr: true, id: true } },
        user: { select: { name: true } },
      },
    }),
    ]);

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Dashboard</h1>
          <p className="admin__subtitle">Managed profiles across the platform.</p>
        </div>
        <div className="admin__actions">
          <Link href="/admin/create" className="admin__button">
            Create digital menu
          </Link>
          <Link href="/admin/businesses/new" className="admin__button admin__button--secondary">
            Detailed form
          </Link>
        </div>
      </header>

      <section className="admin__cards" aria-label="Overview">
        <Metric label="Businesses" value={businesses.length} />
        <Metric label="Active profiles" value={activeProfiles} />
        <Metric label="Branches" value={branches} />
        <Metric label="Published menus" value={menus} />
        <Metric label="Items" value={items} />
        <Metric label="Profile views" value={profileViews} />
        <Metric label="QR scans" value={qrScans} />
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Recent activity</h2>
        {recentAudits.length === 0 ? (
          <p className="admin__empty">No recorded changes yet.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Business</th>
                  <th scope="col">Action</th>
                  <th scope="col">By</th>
                </tr>
              </thead>
              <tbody>
                {recentAudits.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
                    <td>
                      {entry.business ? (
                        <Link href={`/admin/businesses/${entry.business.id}`}>
                          {entry.business.nameEn ?? entry.business.nameAr}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{entry.action}</td>
                    <td>{entry.user?.name ?? '—'}</td>
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin__card">
      <span className="admin__metric">{value}</span>
      <span className="admin__metric-label">{label}</span>
    </div>
  );
}
