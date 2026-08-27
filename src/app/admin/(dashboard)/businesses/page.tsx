import Link from 'next/link';
import { requireUser } from '@/server/auth/current-user';
import { listBusinessesForUser } from '@/server/admin/business-service';

export const dynamic = 'force-dynamic';

export default async function BusinessesPage() {
  const user = await requireUser();
  const businesses = await listBusinessesForUser(user);

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Businesses</h1>
          <p className="admin__subtitle">
            {businesses.length} {businesses.length === 1 ? 'profile' : 'profiles'} you can manage.
          </p>
        </div>
        <Link href="/admin/businesses/new" className="admin__button">
          Create business
        </Link>
      </header>

      <section className="admin__panel">
        {businesses.length === 0 ? (
          <p className="admin__empty">No businesses yet.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Public ID</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="admin__numeric">Menus</th>
                  <th scope="col" className="admin__numeric">Items</th>
                  <th scope="col">Public profile</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((business) => (
                  <tr key={business.id}>
                    <td>
                      <Link href={`/admin/businesses/${business.id}`}>
                        {business.nameEn ?? business.nameAr}
                      </Link>
                    </td>
                    <td>
                      <code>{business.publicId}</code>
                    </td>
                    <td>{business.type}</td>
                    <td>
                      <StatusBadge status={business.status} />
                    </td>
                    <td className="admin__numeric">{business._count.menus}</td>
                    <td className="admin__numeric">{business._count.items}</td>
                    <td>
                      <Link href={`/m/${business.publicId}`} target="_blank" rel="noreferrer">
                        /m/{business.publicId}
                      </Link>
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

export function StatusBadge({ status }: { status: string }) {
  const modifier = status.toLowerCase();
  return <span className={`admin__badge admin__badge--${modifier}`}>{status}</span>;
}
