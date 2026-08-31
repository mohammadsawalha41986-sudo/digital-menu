import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getHoursForAdmin } from '@/server/admin/business-service';
import { updateWorkingHoursAction } from '@/server/admin/actions';
import { TenantAccessError } from '@/server/tenancy/context';
import { TIMEZONE_OPTIONS, openStateOf } from '@/server/business/hours';
import { HoursForm } from './hours-form';

export const dynamic = 'force-dynamic';

/**
 * Opening hours for the business and each of its branches.
 *
 * Branches get their own editor rather than inheriting silently, because a
 * second location with different hours is the ordinary case, not the exception
 * — and a branch that publishes the head office's hours is worse than one that
 * publishes none.
 */
export default async function HoursPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();

  const business = await getHoursForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const state = business.workingHours ? openStateOf(business.workingHours) : null;

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Opening hours</h1>
          <p className="admin__subtitle">
            {business.nameEn ?? business.nameAr} ·{' '}
            <Link href={`/admin/businesses/${business.id}`}>Back to business</Link>
          </p>
        </div>
        {state && state.status !== 'unknown' ? (
          <p className="admin__message admin__message--ok" role="status">
            Right now this business reads as{' '}
            <strong>{state.status === 'open' ? 'open' : 'closed'}</strong> on its public
            profile.
          </p>
        ) : null}
      </header>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Business hours</h2>
        <p className="admin__hint">
          Shown on the public profile, and used for the open/closed badge. These apply to
          every branch that has not set its own.
        </p>
        <HoursForm
          action={updateWorkingHoursAction.bind(null, business.id, { kind: 'business' })}
          hours={business.workingHours}
          timezones={TIMEZONE_OPTIONS}
        />
      </section>

      {business.branches.map((branch) => (
        <section className="admin__panel" key={branch.id} data-branch-hours={branch.key}>
          <h2 className="admin__panel-title">
            Branch — {branch.nameEn ?? branch.nameAr}
          </h2>
          <p className="admin__hint">
            Shown at <code>/m/{business.publicId}/b/{branch.key}</code>.
          </p>
          <HoursForm
            action={updateWorkingHoursAction.bind(null, business.id, {
              kind: 'branch',
              branchId: branch.id,
            })}
            hours={branch.workingHours}
            timezones={TIMEZONE_OPTIONS}
            submitLabel={`Save ${branch.nameEn ?? branch.nameAr} hours`}
          />
        </section>
      ))}
    </>
  );
}
