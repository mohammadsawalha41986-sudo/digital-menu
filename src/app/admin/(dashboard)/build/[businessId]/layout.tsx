import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { BuildRail } from './rail';

export const dynamic = 'force-dynamic';

/**
 * The frame every build step shares: identity at the top, the step rail on the
 * inline start, the step's own screen in the middle, and (on each step page)
 * the live preview at the inline end.
 *
 * The rail is a list of links rather than a locked sequence — the spec asks
 * that any earlier step be reachable, and in practice owners jump back to the
 * logo or the style constantly.
 */
export default async function BuildLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  return (
    <div className="build">
      <header className="build__header">
        <div>
          <p className="build__eyebrow">{business.status === 'ACTIVE' ? 'Published' : 'Draft'}</p>
          <h1 className="build__title build__title--compact">
            {business.nameEn ?? business.nameAr}
          </h1>
        </div>

        <div className="build__header-actions">
          <Link
            href={`/admin/businesses/${business.id}`}
            className="admin__button admin__button--secondary"
          >
            All settings
          </Link>
          {business.status === 'ACTIVE' ? (
            <Link
              href={`/m/${business.publicId}`}
              target="_blank"
              rel="noreferrer"
              className="admin__button"
            >
              View live menu
            </Link>
          ) : null}
        </div>
      </header>

      <div className="build__body">
        <BuildRail businessId={business.id} />
        {children}
      </div>
    </div>
  );
}
