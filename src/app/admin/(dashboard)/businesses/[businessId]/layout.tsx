import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessNav } from '@/server/admin/restaurant-nav';
import { TenantAccessError } from '@/server/tenancy/context';
import { RestaurantNav } from '../../restaurant-nav';

export const dynamic = 'force-dynamic';

/**
 * Every page of one restaurant sits under this: the same breadcrumb, back
 * button and tabs (see RestaurantNav). A restaurant the user cannot see is "not
 * found", the same answer as an unknown id.
 */
export default async function RestaurantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();

  const business = await getBusinessNav(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  return (
    <>
      <RestaurantNav
        businessId={business.id}
        name={business.nameEn ?? business.nameAr}
        live={business.status === 'ACTIVE'}
      />
      {children}
    </>
  );
}
