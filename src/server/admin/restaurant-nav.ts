import { prisma } from '@/server/db/client';
import { requireTenantContext, type AuthenticatedUser } from '@/server/tenancy/context';

/**
 * The few fields the restaurant's navigation strip needs. Kept apart from the
 * full admin read (getBusinessForAdmin), which loads every dish: the strip
 * appears on every restaurant page, so it must stay light.
 */
export async function getBusinessNav(user: AuthenticatedUser, businessId: string) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');
  return prisma.business.findUniqueOrThrow({
    where: { id: context.businessId },
    select: { id: true, nameAr: true, nameEn: true, status: true, publicId: true },
  });
}
