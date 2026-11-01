/**
 * Stores each dish's automatic suggestions as its links, for every restaurant
 * with automatic suggestions on.
 *
 *   npx tsx scripts/link-dish-suggestions.ts           dry run: counts only
 *   npx tsx scripts/link-dish-suggestions.ts --apply   writes the links
 *
 * Only dishes with no picks are changed, so a restaurant's own choice is never
 * overwritten. Each restaurant that changes gets one audit entry listing its
 * links. A link can be cleared in the admin's Upsell page, which returns that
 * dish to automatic suggestions.
 */
import { prisma } from '@/server/db/client';
import {
  automaticLinks,
  MAX_LINKS,
  sectionRole,
  storeAutomaticLinks,
  type LinkDish,
} from '@/server/admin/upsell-links';

const apply = process.argv.includes('--apply');

async function main() {
  const businesses = await prisma.business.findMany({
    where: { autoUpsell: true },
    orderBy: { publicId: 'asc' },
    select: {
      id: true,
      publicId: true,
      status: true,
      menus: {
        select: {
          categories: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: {
              key: true,
              nameAr: true,
              nameEn: true,
              role: true,
              items: {
                where: { availability: { not: 'HIDDEN' } },
                orderBy: { sortOrder: 'asc' },
                select: {
                  itemCode: true,
                  availability: true,
                  priceMinor: true,
                  isFeatured: true,
                  pairsWith: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const totals = {
    businesses: 0,
    changedBusinesses: 0,
    dishes: 0,
    linked: 0,
    alreadyPicked: 0,
    noSuggestion: 0,
    /** Dishes that stay unlinked, by their section's role: why a menu lacks links. */
    noSuggestionByRole: {} as Record<string, number>,
  };

  for (const business of businesses) {
    totals.businesses++;
    const dishes: LinkDish[] = [];
    let order = 0;
    for (const menu of business.menus) {
      for (const category of menu.categories) {
        const role = sectionRole(category.role, category.key, category.nameAr, category.nameEn);
        for (const item of category.items) {
          dishes.push({
            itemCode: item.itemCode,
            availability: item.availability,
            priceMinor: item.priceMinor,
            isFeatured: item.isFeatured,
            pairsWith: item.pairsWith,
            role,
            order: order++,
          });
        }
      }
    }

    const links = automaticLinks(dishes, MAX_LINKS);
    const picked = dishes.filter((dish) => dish.pairsWith.length > 0).length;
    const unlinked = dishes.length - picked - links.size;
    totals.dishes += dishes.length;
    totals.alreadyPicked += picked;
    totals.noSuggestion += unlinked;
    totals.linked += links.size;
    for (const dish of dishes) {
      if (dish.pairsWith.length === 0 && !links.has(dish.itemCode)) {
        totals.noSuggestionByRole[dish.role] = (totals.noSuggestionByRole[dish.role] ?? 0) + 1;
      }
    }

    if (links.size === 0) continue;
    totals.changedBusinesses++;
    console.log(
      `${business.publicId} (${business.status}): ${links.size} dishes linked, ${picked} keep their picks, ${unlinked} have no suggestion`,
    );

    if (!apply) continue;
    await storeAutomaticLinks(prisma, business.id, links);
  }

  console.log(
    JSON.stringify(
      { mode: apply ? 'applied' : 'dry-run', ...totals },
      null,
      1,
    ),
  );
}

main()
  .catch((error) => {
    console.error('link run failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
