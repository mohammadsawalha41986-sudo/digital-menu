import { prisma } from '@/server/db/client';
import { requireTenantContext, tenantScope, type AuthenticatedUser } from '@/server/tenancy/context';
import { isFoodBusiness } from '@/server/quality/checks';
import { reportBusiness, type ReadinessReport } from './readiness';

/** Gathers the nutrition fields and hands them to the pure reporter. */
export async function getNutritionReadiness(
  user: AuthenticatedUser,
  businessId: string,
): Promise<ReadinessReport & { applies: boolean; businessName: string }> {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: context.businessId },
    select: { type: true, nameAr: true, nameEn: true },
  });

  const items = await prisma.menuItem.findMany({
    where: tenantScope(context),
    orderBy: { itemCode: 'asc' },
    select: {
      itemCode: true,
      nameAr: true,
      nameEn: true,
      calories: true,
      caffeineMg: true,
      sodiumMg: true,
      proteinDeci: true,
      carbsDeci: true,
      fatDeci: true,
      fibreDeci: true,
      sugarDeci: true,
      servingSizeAr: true,
      servingSizeEn: true,
      allergens: true,
      highSalt: true,
      activityNoteAr: true,
      activityNoteEn: true,
    },
  });

  return {
    ...reportBusiness(
      items.map((item) => ({ ...item, name: item.nameEn ?? item.nameAr })),
    ),
    // A salon has no nutrition to report. Saying so is better than showing an
    // empty checklist that reads as a failure (§05).
    applies: isFoodBusiness(business.type),
    businessName: business.nameEn ?? business.nameAr,
  };
}
