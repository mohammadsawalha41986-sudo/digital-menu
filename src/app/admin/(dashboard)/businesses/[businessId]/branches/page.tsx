import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { createBranchAction, deleteBranchAction } from '@/server/admin/actions';
import { BranchEditor } from './branch-editor';

export const dynamic = 'force-dynamic';

export default async function BranchesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
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
          <h1 className="admin__title">Branches</h1>
          <p className="admin__subtitle">
            Each branch has its own permanent QR at <code>/m/{business.publicId}/b/&#123;key&#125;</code>.
            The key is part of a printed code — treat it as permanent once printed.
          </p>
        </div>
        <Link
          href={`/admin/businesses/${business.id}`}
          className="admin__button admin__button--secondary"
        >
          Back to business
        </Link>
      </header>

      <BranchEditor
        businessId={business.id}
        publicId={business.publicId}
        branches={business.branches.map((branch) => ({
          id: branch.id,
          key: branch.key,
          nameAr: branch.nameAr,
          nameEn: branch.nameEn,
          phone: branch.phone,
          isActive: branch.isActive,
        }))}
        createBranch={createBranchAction.bind(null, business.id, business.publicId)}
        deleteBranch={deleteBranchAction}
      />
    </>
  );
}
