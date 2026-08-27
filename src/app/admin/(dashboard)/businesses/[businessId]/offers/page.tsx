import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { listOffersForAdmin } from '@/server/offers/service';
import { TenantAccessError } from '@/server/tenancy/context';
import { deleteOfferAction, upsertOfferAction } from '@/server/admin/offer-actions';
import { formatMinorAsDecimal } from '@/lib/money';
import { OfferManager } from './offer-manager';

export const dynamic = 'force-dynamic';

export default async function OffersPage({
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

  const offers = await listOffersForAdmin(user, businessId);

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Offers</h1>
          <p className="admin__subtitle">
            Scheduling is enforced at read time, so an expired offer disappears from the profile
            on its own — no job has to run for that to happen.
          </p>
        </div>
        <Link
          href={`/admin/businesses/${business.id}`}
          className="admin__button admin__button--secondary"
        >
          Back to business
        </Link>
      </header>

      <OfferManager
        businessId={business.id}
        publicId={business.publicId}
        currency={business.currency}
        offers={offers.map((offer) => ({
          id: offer.id,
          key: offer.key,
          titleAr: offer.titleAr,
          titleEn: offer.titleEn,
          state: offer.state,
          placement: offer.placement,
          startsAt: offer.startsAt?.toISOString() ?? null,
          endsAt: offer.endsAt?.toISOString() ?? null,
          offerPrice:
            offer.offerPriceMinor === null
              ? null
              : formatMinorAsDecimal(offer.offerPriceMinor, business.currency),
        }))}
        upsertOffer={upsertOfferAction.bind(null, business.id, business.publicId)}
        deleteOffer={deleteOfferAction}
      />
    </>
  );
}
