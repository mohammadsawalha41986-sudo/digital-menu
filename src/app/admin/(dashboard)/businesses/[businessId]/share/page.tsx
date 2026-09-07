import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { getEnv } from '@/lib/env';
import { SharePanel } from './share-panel';

export const dynamic = 'force-dynamic';

/**
 * Links, QR and embed — one screen per business.
 *
 * The three things an operator needs once a menu exists are the address to
 * send someone, the code to print, and the snippet to paste into the
 * restaurant's own website. They were spread across three screens and, in the
 * embed's case, nowhere at all.
 *
 * Every address here is built from `PUBLIC_URL`, which is the same value the
 * printed QR codes encode. If they ever disagreed, the link an operator copied
 * would not be the one on the table.
 */
export default async function SharePage({
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

  const base = getEnv().PUBLIC_URL.replace(/\/$/, '');

  const menus = business.menus.map((menu) => ({
    id: menu.id,
    key: menu.key,
    title: menu.titleEn ?? menu.titleAr,
    status: menu.status,
    published: Boolean(menu.currentVersion),
    categories: menu.categories.length,
    items: menu.categories.reduce((total, category) => total + category.items.length, 0),
  }));

  const branches = business.branches.map((branch) => ({
    key: branch.key,
    title: branch.nameEn ?? branch.nameAr,
  }));

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Links, QR &amp; embed</h1>
          <p className="admin__subtitle">
            {business.nameEn ?? business.nameAr} ·{' '}
            <Link href={`/admin/businesses/${business.id}`}>Back to business</Link>
          </p>
        </div>
        <Link
          href={`/admin/businesses/${business.id}/qr`}
          className="admin__button admin__button--secondary"
        >
          QR codes
        </Link>
      </header>

      <SharePanel
        businessId={business.id}
        publicId={business.publicId}
        businessName={business.nameEn ?? business.nameAr}
        base={base}
        menus={menus}
        branches={branches}
      />
    </>
  );
}
