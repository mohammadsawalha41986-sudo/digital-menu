import Link from 'next/link';
import { requireUser } from '@/server/auth/current-user';
import { listBusinessesForUser } from '@/server/admin/business-service';
import { resolveMediaUrl } from '@/server/media/url';
import { getStorage } from '@/server/storage';

export const dynamic = 'force-dynamic';

/**
 * Businesses — the dashboard the user calls "the main page where I can see
 * every restaurant and jump into one". Rendered as a visual card grid rather
 * than a table so the operator sees each restaurant's identity (logo + brand
 * palette) at a glance; the table-of-rows pattern made every restaurant
 * look the same.
 */
export default async function BusinessesPage() {
  const user = await requireUser();
  const businesses = await listBusinessesForUser(user);

  const totals = {
    all: businesses.length,
    active: businesses.filter((b) => b.status === 'ACTIVE').length,
    draft: businesses.filter((b) => b.status === 'DRAFT').length,
    inactive: businesses.filter((b) => b.status === 'INACTIVE').length,
  };

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Restaurants</h1>
          <p className="admin__subtitle">
            {totals.all === 0
              ? 'No restaurants yet — create your first one below.'
              : `${totals.all} ${totals.all === 1 ? 'profile' : 'profiles'} you can manage.`}
          </p>
        </div>
        <div className="admin__actions">
          <Link href="/admin/create" className="admin__button">
            + New restaurant
          </Link>
          <Link href="/admin/businesses/new" className="admin__button admin__button--secondary">
            Detailed form
          </Link>
        </div>
      </header>

      {totals.all > 0 ? (
        <section className="business-stats" aria-label="Totals">
          <StatTile label="Active" value={totals.active} tone="ok" />
          <StatTile label="Draft" value={totals.draft} tone="warn" />
          <StatTile label="Inactive" value={totals.inactive} tone="muted" />
        </section>
      ) : null}

      {businesses.length === 0 ? (
        <section className="admin__panel">
          <p className="admin__empty">
            You have not created any restaurants yet. Press <strong>New restaurant</strong> above to
            begin — the guided flow walks through logo, menu and brand in a few minutes.
          </p>
        </section>
      ) : (
        <section className="business-grid" aria-label="Restaurants">
          {businesses.map((business) => {
            const logoUrl = business.logo
              ? resolveMediaUrl(business.logo, (key) => getStorage().publicUrl(key))
              : null;
            const brand = business.brandTheme;
            const style: Record<string, string> = brand
              ? {
                  '--card-primary': brand.colorPrimary,
                  '--card-accent': brand.colorAccent,
                  '--card-background': brand.colorBackground,
                }
              : {};

            return (
              <article
                key={business.id}
                className="business-card"
                data-status={business.status.toLowerCase()}
                style={style}
              >
                <Link
                  href={`/admin/businesses/${business.id}`}
                  className="business-card__cover"
                  aria-label={`Manage ${business.nameEn ?? business.nameAr}`}
                >
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="business-card__logo"
                      src={logoUrl}
                      alt={business.logo?.altAr ?? business.nameAr}
                    />
                  ) : (
                    <span className="business-card__logo-fallback" aria-hidden="true">
                      {(business.nameEn ?? business.nameAr).charAt(0)}
                    </span>
                  )}
                </Link>

                <div className="business-card__body">
                  <header className="business-card__head">
                    <h2 className="business-card__name">
                      <Link href={`/admin/businesses/${business.id}`}>
                        {business.nameEn ?? business.nameAr}
                      </Link>
                    </h2>
                    <StatusBadge status={business.status} />
                  </header>

                  <p className="business-card__meta">
                    {business.type.toLowerCase()} · {business.templateKey} ·{' '}
                    <code>{business.publicId}</code>
                  </p>

                  <dl className="business-card__stats">
                    <div>
                      <dt>Menus</dt>
                      <dd>{business._count.menus}</dd>
                    </div>
                    <div>
                      <dt>Items</dt>
                      <dd>{business._count.items}</dd>
                    </div>
                    <div>
                      <dt>Branches</dt>
                      <dd>{business._count.branches}</dd>
                    </div>
                  </dl>

                  {brand ? (
                    <ul className="business-card__swatches" aria-label="Brand colours">
                      <li style={{ background: brand.colorPrimary }} title="Primary" />
                      <li style={{ background: brand.colorAccent }} title="Accent" />
                      <li style={{ background: brand.colorBackground }} title="Background" />
                    </ul>
                  ) : null}

                  <footer className="business-card__actions">
                    <Link
                      href={`/admin/businesses/${business.id}`}
                      className="admin__button admin__button--small"
                    >
                      Manage
                    </Link>
                    <Link
                      href={`/admin/businesses/${business.id}/design`}
                      className="admin__button admin__button--small admin__button--secondary"
                    >
                      Design
                    </Link>
                    <Link
                      href={`/m/${business.publicId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="admin__button admin__button--small admin__button--secondary"
                    >
                      View ↗
                    </Link>
                  </footer>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'muted';
}) {
  return (
    <div className="business-stats__tile" data-tone={tone}>
      <span className="business-stats__value">{value}</span>
      <span className="business-stats__label">{label}</span>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const modifier = status.toLowerCase();
  return <span className={`admin__badge admin__badge--${modifier}`}>{status}</span>;
}
