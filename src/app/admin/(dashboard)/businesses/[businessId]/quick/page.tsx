import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { prisma } from '@/server/db/client';
import { requireTenantContext, TenantAccessError, tenantScope } from '@/server/tenancy/context';
import {
  quickContactAction,
  quickPriceAction,
  toggleItemAvailabilityAction,
  toggleOfferAction,
} from '@/server/admin/quick-actions';
import { formatMinorAsDecimal } from '@/lib/money';
import { QuickPanel } from './panel';

export const dynamic = 'force-dynamic';

/**
 * Service mode (master spec §21, §22, §166).
 *
 * One screen, large targets, no navigation. The three things that go wrong
 * during service — an item runs out, a price is wrong, an offer must stop —
 * each take one tap or one field, and the contact numbers are here because
 * they are what a business changes in a hurry.
 *
 * Deliberately plain. §22 asks for minimal decoration and speed, and every
 * decorative element on this screen is something between a busy operator and
 * the button they need.
 */
export default async function QuickPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const user = await requireUser();

  const context = await requireTenantContext(user, businessId, 'EDITOR').catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const search = typeof query.q === 'string' ? query.q.trim() : '';

  const [business, items, offers] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: context.businessId },
      select: { id: true, publicId: true, nameAr: true, nameEn: true, currency: true, phone: true, whatsapp: true },
    }),
    prisma.menuItem.findMany({
      where: {
        ...tenantScope(context),
        ...(search
          ? {
              OR: [
                { nameAr: { contains: search, mode: 'insensitive' as const } },
                { nameEn: { contains: search, mode: 'insensitive' as const } },
                { itemCode: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      // Unavailable first: during service, the list you want is what is off.
      orderBy: [{ availability: 'desc' }, { itemCode: 'asc' }],
      take: 60,
      select: {
        itemCode: true,
        nameAr: true,
        nameEn: true,
        priceMinor: true,
        availability: true,
      },
    }),
    prisma.offer.findMany({
      where: tenantScope(context),
      orderBy: { sortOrder: 'asc' },
      select: { key: true, titleAr: true, titleEn: true, isActive: true },
    }),
  ]);

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Service mode</h1>
          <p className="admin__subtitle">
            {business.nameEn ?? business.nameAr} — the changes that cannot wait.{' '}
            <Link href={`/admin/businesses/${businessId}`}>Full admin</Link>
          </p>
        </div>
      </header>

      <QuickPanel
        businessId={businessId}
        currency={business.currency}
        search={search}
        items={items.map((item) => ({
          itemCode: item.itemCode,
          name: item.nameEn ?? item.nameAr,
          price: item.priceMinor === null ? '' : formatMinorAsDecimal(item.priceMinor, business.currency),
          isUnavailable: item.availability === 'UNAVAILABLE',
        }))}
        offers={offers.map((offer) => ({
          key: offer.key,
          title: offer.titleEn ?? offer.titleAr,
          isActive: offer.isActive,
        }))}
        contact={{ phone: business.phone, whatsapp: business.whatsapp }}
        toggleAvailability={toggleItemAvailabilityAction}
        setPrice={quickPriceAction}
        toggleOffer={toggleOfferAction}
        saveContact={quickContactAction.bind(null, businessId)}
      />
    </>
  );
}
