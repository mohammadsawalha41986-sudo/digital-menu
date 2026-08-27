import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import {
  createCategoryAction,
  createMenuAction,
  deleteCategoryAction,
  deleteItemAction,
  publishMenuAction,
  upsertItemAction,
} from '@/server/admin/actions';
import { formatMinorAsDecimal } from '@/lib/money';
import { MenuEditor } from './menu-editor';

export const dynamic = 'force-dynamic';

/**
 * Menu management.
 *
 * The publish control is the load-bearing one: it appends a version and
 * repoints the menu atomically, and the copy says plainly that the same QR
 * then serves the new content (master spec §125, §151).
 */
export default async function MenusPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const menus = business.menus.map((menu) => ({
    id: menu.id,
    key: menu.key,
    titleAr: menu.titleAr,
    titleEn: menu.titleEn,
    status: menu.status,
    publishedVersion: menu.currentVersion?.version ?? null,
    publishedAt: menu.currentVersion?.publishedAt?.toISOString() ?? null,
    categories: menu.categories.map((category) => ({
      id: category.id,
      key: category.key,
      nameAr: category.nameAr,
      nameEn: category.nameEn,
      items: category.items.map((item) => ({
        id: item.id,
        itemCode: item.itemCode,
        nameAr: item.nameAr,
        nameEn: item.nameEn,
        price:
          item.priceMinor === null ? '' : formatMinorAsDecimal(item.priceMinor, item.currency),
        calories: item.calories,
        availability: item.availability,
      })),
    })),
  }));

  const categoryKeys = menus.flatMap((menu) => menu.categories.map((category) => category.key));

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Menus</h1>
          <p className="admin__subtitle">
            Content for {business.nameEn ?? business.nameAr}. Currency: {business.currency}.
          </p>
        </div>
        <Link
          href={`/admin/businesses/${business.id}`}
          className="admin__button admin__button--secondary"
        >
          Back to business
        </Link>
      </header>

      <MenuEditor
        businessId={business.id}
        publicId={business.publicId}
        currency={business.currency}
        menus={menus}
        categoryKeys={categoryKeys}
        createMenu={createMenuAction.bind(null, business.id, business.publicId)}
        createCategory={createCategoryAction}
        publishMenu={publishMenuAction}
        deleteCategory={deleteCategoryAction}
        upsertItem={upsertItemAction.bind(null, business.id, business.publicId)}
        deleteItem={deleteItemAction}
      />
    </>
  );
}
