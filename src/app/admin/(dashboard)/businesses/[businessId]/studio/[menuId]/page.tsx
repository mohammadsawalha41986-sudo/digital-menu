import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { prisma } from '@/server/db/client';
import { getMenuDesign } from '@/server/menu-studio/design';
import { MENU_THEMES } from '@/menu-studio/themes';
import { computeMargin, summariseMargins } from '@/server/menu-studio/margin';
import { StudioEditor } from './editor';
import { BulkEdit } from './bulk-edit';

export const dynamic = 'force-dynamic';

/**
 * The studio editor (Menu Studio §17).
 *
 * Three panes: structure on the inline start, the live menu in the middle,
 * design settings on the inline end. The middle pane is an iframe of the real
 * public profile — not a mock of it — so what an operator approves is what a
 * customer gets.
 */
export default async function StudioEditorPage({
  params,
}: {
  params: Promise<{ businessId: string; menuId: string }>;
}) {
  const { businessId, menuId } = await params;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const menu = await prisma.menu.findFirst({
    where: { id: menuId, businessId: business.id },
    include: {
      currentVersion: { select: { version: true, publishedAt: true } },
      categories: {
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              itemCode: true,
              nameAr: true,
              nameEn: true,
              priceMinor: true,
              costMinor: true,
              calories: true,
              tags: true,
              availability: true,
              imageMediaId: true,
            },
          },
        },
      },
    },
  });

  if (!menu) notFound();

  const design = await getMenuDesign(user, business.id, menu.id);

  // One level of hierarchy, resolved for display: parents in order, each
  // followed by its children.
  const byId = new Map(menu.categories.map((category) => [category.id, category]));
  const parents = menu.categories.filter((category) => category.parentId === null);
  const structure = parents.map((parent) => ({
    id: parent.id,
    key: parent.key,
    name: parent.nameEn ?? parent.nameAr,
    items: parent.items,
    children: menu.categories
      .filter((category) => category.parentId === parent.id)
      .map((child) => ({
        id: child.id,
        key: child.key,
        name: child.nameEn ?? child.nameAr,
        items: child.items,
      })),
  }));

  // A category whose parent was deleted would otherwise vanish from the tree.
  const orphans = menu.categories.filter(
    (category) => category.parentId !== null && !byId.has(category.parentId),
  );

  const allItems = menu.categories.flatMap((category) => category.items);
  const costs = summariseMargins(allItems);

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">{menu.titleEn ?? menu.titleAr}</h1>
          <p className="admin__subtitle">
            {allItems.length} items ·{' '}
            {menu.currentVersion ? `published v${menu.currentVersion.version}` : 'not published'} ·{' '}
            {design.resolved.theme.label}
          </p>
        </div>
        <div className="admin__header-actions">
          <Link
            href={`/admin/businesses/${business.id}/menus`}
            className="admin__button admin__button--secondary"
          >
            Edit content
          </Link>
          <Link href={`/admin/businesses/${business.id}/studio`} className="admin__button admin__button--secondary">
            All menus
          </Link>
        </div>
      </header>

      <StudioEditor
        businessId={business.id}
        menuId={menu.id}
        // Framed: the staff preview, so an unpublished menu still previews.
        previewPath={`/admin/preview/${business.id}`}
        // Linked: the real public address, which is what "open" should mean.
        publicPath={`/m/${business.publicId}`}
        design={{
          themeKey: design.themeKey,
          layoutKey: design.layoutKey,
          fonts: design.fonts,
          imageStyle: design.imageStyle,
          density: design.density,
          showPrices: design.showPrices,
          showImages: design.showImages,
          showCalories: design.showCalories,
        }}
        themes={MENU_THEMES.map((theme) => ({
          key: theme.key,
          label: theme.label,
          description: theme.description,
          tonePreference: theme.tonePreference,
          layouts: theme.layouts.map((layout) => ({
            key: layout.key,
            label: layout.label,
            description: layout.description,
          })),
        }))}
        structure={structure.map((category) => ({
          ...category,
          items: category.items.map(toItemView),
          children: category.children.map((child) => ({
            ...child,
            items: child.items.map(toItemView),
          })),
        }))}
        orphans={orphans.map((category) => ({
          id: category.id,
          key: category.key,
          name: category.nameEn ?? category.nameAr,
        }))}
        costSummary={{
          covered: costs.covered,
          total: costs.total,
          averageRatio: costs.averageRatio,
        }}
        currency={business.currency}
      />

      <BulkEdit
        businessId={business.id}
        currency={business.currency}
        categories={menu.categories.map((category) => ({
          key: category.key,
          name: category.nameEn ?? category.nameAr,
        }))}
        rows={menu.categories.flatMap((category) =>
          category.items.map((item) => ({
            code: item.itemCode,
            name: item.nameEn ?? item.nameAr,
            category: category.nameEn ?? category.nameAr,
            price: item.priceMinor,
            availability: item.availability,
            tags: item.tags,
          })),
        )}
      />
    </>
  );
}

function toItemView(item: {
  id: string;
  itemCode: string;
  nameAr: string;
  nameEn: string | null;
  priceMinor: number | null;
  costMinor: number | null;
  calories: number | null;
  tags: string[];
  availability: string;
  imageMediaId: string | null;
}) {
  const margin = computeMargin(item.priceMinor, item.costMinor);

  return {
    id: item.id,
    code: item.itemCode,
    name: item.nameEn ?? item.nameAr,
    price: item.priceMinor,
    calories: item.calories,
    tags: item.tags,
    availability: item.availability,
    hasImage: item.imageMediaId !== null,
    // Null unless the business entered a cost. The UI shows nothing at all in
    // that case rather than a zero or a guess.
    margin: margin ? { ratio: margin.ratio, band: margin.band } : null,
  };
}
