import { requireSuperAdmin } from '@/server/auth/current-user';
import { createBusinessAction } from '@/server/admin/actions';
import { BusinessForm } from '../[businessId]/business-form';

export const dynamic = 'force-dynamic';

export default async function NewBusinessPage() {
  // Creating a tenant is a platform action: there is no membership to check
  // for a business that does not exist yet.
  await requireSuperAdmin();

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Create business</h1>
          <p className="admin__subtitle">
            A permanent public identifier is allocated on save and never changes.
          </p>
        </div>
      </header>

      <section className="admin__panel">
        <BusinessForm business={{ status: 'DRAFT' }} action={createBusinessAction} submitLabel="Create business" />
      </section>
    </>
  );
}
