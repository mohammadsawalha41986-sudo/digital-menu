import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { getDeliverySettings } from '@/server/delivery/service';
import { TenantAccessError } from '@/server/tenancy/context';
import { formatMinorAsDecimal } from '@/lib/money';
import { DeliveryForm } from './delivery-form';

export const dynamic = 'force-dynamic';

/**
 * Where the restaurant delivers, and what each distance costs. The cart reads
 * this to add the delivery fee to the customer's order.
 */
export default async function DeliveryPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();

  const [business, settings] = await Promise.all([
    getBusinessForAdmin(user, businessId),
    getDeliverySettings(user, businessId),
  ]).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">التوصيل · Delivery</h1>
          <p className="admin__subtitle">{business.nameEn ?? business.nameAr}</p>
        </div>
      </header>

      <DeliveryForm
        businessId={settings.businessId}
        currency={settings.currency}
        canEdit={settings.canEdit}
        origin={settings.origin}
        zones={settings.zones.map((zone) => ({
          maxKm: String(zone.maxKm),
          fee: formatMinorAsDecimal(zone.feeMinor, settings.currency),
        }))}
      />
    </>
  );
}
