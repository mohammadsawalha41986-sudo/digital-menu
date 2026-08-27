import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { updateBrandAction } from '@/server/admin/actions';
import { BrandForm } from './brand-form';

export const dynamic = 'force-dynamic';

export default async function BrandPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Brand</h1>
          <p className="admin__subtitle">
            Visual identity for {business.nameEn ?? business.nameAr}. Changing colours or type
            never changes the QR, the URL, menu data or analytics.
          </p>
        </div>
        <Link
          href={`/admin/businesses/${business.id}`}
          className="admin__button admin__button--secondary"
        >
          Back to business
        </Link>
      </header>

      <section className="admin__panel">
        <BrandForm
          brand={business.brandTheme}
          action={updateBrandAction.bind(null, business.id, business.publicId)}
        />
      </section>
    </>
  );
}
