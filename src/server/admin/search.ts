import { prisma } from '@/server/db/client';
import { listBusinessesForUser } from './business-service';
import type { AuthenticatedUser } from '@/server/tenancy/context';

/**
 * Global search (master spec §91).
 *
 * One box across businesses, branches, menus, categories, items, offers and
 * files. At agency scale the alternative is remembering which of fifty
 * profiles a dish belongs to, which is not a thing anyone remembers.
 *
 * Scoping is not a filter applied afterwards: the set of businesses the user
 * may see is resolved first, and every query is bounded to it. A search box is
 * exactly the surface where a missing tenant check turns into one client
 * reading another's menu (GOALS I8).
 */

export type SearchKind = 'business' | 'branch' | 'menu' | 'category' | 'item' | 'offer' | 'file';

export interface SearchHit {
  kind: SearchKind;
  title: string;
  subtitle: string;
  href: string;
  businessName: string;
}

const PER_KIND = 8;

export async function globalSearch(
  user: AuthenticatedUser,
  rawQuery: string,
): Promise<{ hits: SearchHit[]; truncated: boolean }> {
  const query = rawQuery.trim();

  // Two characters is the point where results stop being the whole database.
  if (query.length < 2) return { hits: [], truncated: false };

  const visible = await listBusinessesForUser(user);
  const ids = visible.map((business) => business.id);

  if (ids.length === 0) return { hits: [], truncated: false };

  const nameOf = new Map(
    visible.map((business) => [business.id, business.nameEn ?? business.nameAr]),
  );

  const contains = { contains: query, mode: 'insensitive' as const };
  const scope = { businessId: { in: ids } };

  const [branches, menus, categories, items, offers, files] = await Promise.all([
    prisma.branch.findMany({
      where: { ...scope, OR: [{ nameAr: contains }, { nameEn: contains }, { key: contains }] },
      take: PER_KIND,
      select: { key: true, nameAr: true, nameEn: true, businessId: true },
    }),
    prisma.menu.findMany({
      where: { ...scope, OR: [{ titleAr: contains }, { titleEn: contains }, { key: contains }] },
      take: PER_KIND,
      select: { id: true, key: true, titleAr: true, titleEn: true, businessId: true },
    }),
    prisma.menuCategory.findMany({
      where: { ...scope, OR: [{ nameAr: contains }, { nameEn: contains }, { key: contains }] },
      take: PER_KIND,
      select: { key: true, nameAr: true, nameEn: true, businessId: true },
    }),
    prisma.menuItem.findMany({
      where: {
        ...scope,
        OR: [{ nameAr: contains }, { nameEn: contains }, { itemCode: contains }],
      },
      take: PER_KIND * 2,
      select: { itemCode: true, nameAr: true, nameEn: true, businessId: true },
    }),
    prisma.offer.findMany({
      where: { ...scope, OR: [{ titleAr: contains }, { titleEn: contains }, { key: contains }] },
      take: PER_KIND,
      select: { key: true, titleAr: true, titleEn: true, businessId: true },
    }),
    prisma.publicFile.findMany({
      where: { ...scope, OR: [{ titleAr: contains }, { titleEn: contains }, { key: contains }] },
      take: PER_KIND,
      select: { key: true, titleAr: true, titleEn: true, businessId: true },
    }),
  ]);

  const businessHits: SearchHit[] = visible
    .filter((business) =>
      [business.nameAr, business.nameEn, business.publicId, business.slug]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(query.toLowerCase())),
    )
    .slice(0, PER_KIND)
    .map((business) => ({
      kind: 'business' as const,
      title: business.nameEn ?? business.nameAr,
      subtitle: business.publicId,
      href: `/admin/businesses/${business.id}`,
      businessName: business.nameEn ?? business.nameAr,
    }));

  const hit = (
    kind: SearchKind,
    businessId: string,
    title: string,
    subtitle: string,
    path: string,
  ): SearchHit => ({
    kind,
    title,
    subtitle,
    href: `/admin/businesses/${businessId}${path}`,
    businessName: nameOf.get(businessId) ?? '',
  });

  const hits: SearchHit[] = [
    ...businessHits,
    ...items.map((item) =>
      hit('item', item.businessId, item.nameEn ?? item.nameAr, item.itemCode, '/menus'),
    ),
    ...categories.map((category) =>
      hit('category', category.businessId, category.nameEn ?? category.nameAr, category.key, '/menus'),
    ),
    ...menus.map((menu) =>
      hit('menu', menu.businessId, menu.titleEn ?? menu.titleAr, menu.key, `/menus/${menu.id}/versions`),
    ),
    ...offers.map((offer) =>
      hit('offer', offer.businessId, offer.titleEn ?? offer.titleAr, offer.key, '/offers'),
    ),
    ...branches.map((branch) =>
      hit('branch', branch.businessId, branch.nameEn ?? branch.nameAr, branch.key, '/branches'),
    ),
    ...files.map((file) =>
      hit('file', file.businessId, file.titleEn ?? file.titleAr, file.key, '/files'),
    ),
  ];

  return { hits: hits.slice(0, 60), truncated: hits.length > 60 };
}
