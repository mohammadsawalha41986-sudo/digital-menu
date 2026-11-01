/**
 * Turns on the menu services that every restaurant should have, and reports the
 * ones that need the owner's own decision.
 *
 *   npx tsx scripts/enable-menu-services.ts           dry run: counts only
 *   npx tsx scripts/enable-menu-services.ts --apply   writes the changes
 *
 * Turned on here: automatic dish suggestions (autoUpsell). The welcome message,
 * the install offer and the analytics events are part of the menu itself, so
 * they reach every menu with no setting.
 *
 * Not changed here, and reported only: showPlatformFooter (the "Digital Menu by"
 * footer, part of the service package, so a commercial decision), indexProfile
 * (public search indexing), and the WhatsApp number, which the restaurant
 * supplies. Each restaurant that changes gets one audit entry.
 */
import { prisma } from '@/server/db/client';

const apply = process.argv.includes('--apply');

async function main() {
  const off = await prisma.business.findMany({
    where: { autoUpsell: false },
    select: { id: true, publicId: true, status: true },
    orderBy: { publicId: 'asc' },
  });

  for (const business of off) {
    console.log(`${business.publicId} (${business.status}): automatic suggestions off, ${apply ? 'turning on' : 'would turn on'}`);
    if (!apply) continue;
    await prisma.$transaction([
      prisma.business.update({ where: { id: business.id }, data: { autoUpsell: true } }),
      prisma.auditLog.create({
        data: {
          businessId: business.id,
          action: 'business.services_enabled',
          entity: 'Business',
          entityId: business.id,
          metadata: { autoUpsell: { before: false, after: true } },
        },
      }),
    ]);
  }

  const [total, footer, indexed, whatsapp, active] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { showPlatformFooter: true } }),
    prisma.business.count({ where: { indexProfile: true } }),
    prisma.business.count({ where: { whatsapp: { not: null } } }),
    prisma.business.count({ where: { status: 'ACTIVE' } }),
  ]);

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'applied' : 'dry-run',
        businesses: total,
        activeBusinesses: active,
        autoUpsellChanged: off.length,
        reportedNotChanged: {
          platformFooterOn: footer,
          searchIndexingOn: indexed,
          withWhatsappNumber: whatsapp,
        },
      },
      null,
      1,
    ),
  );
}

main()
  .catch((error) => {
    console.error('enable run failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
