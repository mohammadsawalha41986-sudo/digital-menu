import type { PrismaClient } from '@/generated/prisma/client';
import { effectiveRole, suggestionsFor, type SectionRole, type SuggestionCandidate } from '@/lib/upsell';

/**
 * Stores the automatic suggestions as dishes' links.
 *
 * A dish with no picks of its own is given the dishes the menu would suggest
 * for it (src/lib/upsell.ts). This module works out those links from a menu's
 * visible dishes; the caller writes them. A dish that already has picks is never
 * changed, because a restaurant's own choice always wins.
 */

export interface LinkDish {
  itemCode: string;
  /** `UNAVAILABLE`, `AVAILABLE` or `HIDDEN` (hidden dishes are not passed in). */
  availability: string;
  priceMinor: number | null;
  isFeatured: boolean;
  pairsWith: string[];
  /** The section's role, already resolved from its stored role or its names. */
  role: SectionRole;
  /** The restaurant's own order across the menu: lower comes first. */
  order: number;
}

/** The most links one dish takes. The admin's limit (MAX_PAIRINGS) is this same value. */
export const MAX_LINKS = 3;

/**
 * The links to store, keyed by item code. Only dishes with no picks appear, and
 * only with at least one suggestion. `limit` is the most links one dish takes.
 */
export function automaticLinks(dishes: LinkDish[], limit: number = MAX_LINKS): Map<string, string[]> {
  const pool: SuggestionCandidate[] = dishes.map((dish) => ({
    id: dish.itemCode,
    role: dish.role,
    featured: dish.isFeatured,
    order: dish.order,
    orderable: dish.availability !== 'UNAVAILABLE' && dish.priceMinor !== null,
  }));

  const links = new Map<string, string[]>();
  for (const dish of dishes) {
    if (dish.pairsWith.length > 0) continue;
    const picks = suggestionsFor({ id: dish.itemCode, role: dish.role }, pool, limit);
    if (picks.length > 0) links.set(dish.itemCode, picks);
  }
  return links;
}

/**
 * Writes the links for one restaurant, marking each as automatic, and records
 * one audit entry. A dish whose picks changed since the links were worked out
 * is left alone: the write only reaches dishes that still have no picks.
 */
export async function storeAutomaticLinks(
  db: PrismaClient,
  businessId: string,
  links: Map<string, string[]>,
): Promise<void> {
  if (links.size === 0) return;
  await db.$transaction([
    ...[...links].map(([itemCode, pairsWith]) =>
      db.menuItem.updateMany({
        where: { businessId, itemCode, pairsWith: { equals: [] } },
        data: { pairsWith, pairsAuto: true },
      }),
    ),
    db.auditLog.create({
      data: {
        businessId,
        action: 'upsell.auto_linked',
        entity: 'Business',
        entityId: businessId,
        metadata: { linked: links.size, links: Object.fromEntries(links) },
      },
    }),
  ]);
}

/** The role a section counts as, for a link run: its stored role, else its names. */
export function sectionRole(stored: string | null, key: string, nameAr: string, nameEn: string | null): SectionRole {
  return effectiveRole(stored, key, nameAr, nameEn);
}
