import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { updateBusinessAction } from '@/server/admin/actions';
import { BusinessForm } from './business-form';

export const dynamic = 'force-dynamic';

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();

  // A business the user has no grant for is "not found", never "forbidden":
  // the admin UI must not confirm that an id exists (master spec §128).
  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const itemCount = business.menus.reduce(
    (total, menu) =>
      total + menu.categories.reduce((count, category) => count + category.items.length, 0),
    0,
  );

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">{business.nameEn ?? business.nameAr}</h1>
          <p className="admin__subtitle">
            Public profile:{' '}
            <Link href={`/m/${business.publicId}`} target="_blank" rel="noreferrer">
              /m/{business.publicId}
            </Link>{' '}
            — permanent, and unaffected by anything on this page.
          </p>
        </div>
        <nav className="admin__actions" aria-label="Business sections">
          <Link href={`/admin/businesses/${business.id}/menus`} className="admin__button admin__button--secondary">
            Menus ({business.menus.length})
          </Link>
          <Link href={`/admin/businesses/${business.id}/branches`} className="admin__button admin__button--secondary">
            Branches ({business.branches.length})
          </Link>
          <Link href={`/admin/businesses/${business.id}/brand`} className="admin__button admin__button--secondary">
            Brand
          </Link>
          <Link href={`/admin/businesses/${business.id}/template`} className="admin__button admin__button--secondary">
            Template
          </Link>
          <Link href={`/admin/businesses/${business.id}/qr`} className="admin__button">
            QR codes
          </Link>
        </nav>
      </header>

      <section className="admin__cards" aria-label="Summary">
        <div className="admin__card">
          <span className="admin__metric">{business.menus.length}</span>
          <span className="admin__metric-label">Menus</span>
        </div>
        <div className="admin__card">
          <span className="admin__metric">{itemCount}</span>
          <span className="admin__metric-label">Items</span>
        </div>
        <div className="admin__card">
          <span className="admin__metric">{business.branches.length}</span>
          <span className="admin__metric-label">Branches</span>
        </div>
        <div className="admin__card">
          <span className="admin__metric-label">Template</span>
          <span>
            {business.templateKey} / {business.variantKey}
          </span>
        </div>
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Business details</h2>
        <BusinessForm
          business={business}
          action={updateBusinessAction.bind(null, business.id)}
          submitLabel="Save business"
        />
      </section>
    </>
  );
}
