import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { MAX_PAIRINGS, NEW_TAG, getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { setUpsellAction } from '@/server/admin/actions';
import { UpsellRow } from './upsell-row';

export const dynamic = 'force-dynamic';

/**
 * Upsell, set by the restaurant: for each dish, the dishes offered with it
 * ("complete your meal" — broasted with a Pepsi), and which dishes are new.
 * The menu shows both to the customer: suggestions in the dish sheet and the
 * cart, and a "new" badge on the card.
 */
export default async function UpsellPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const categories = business.menus.flatMap((menu) =>
    menu.categories.map((category) => ({
      key: `${menu.key}:${category.key}`,
      name: category.nameAr,
      items: category.items.filter((item) => item.availability !== 'HIDDEN'),
    })),
  );
  const options = categories.flatMap((category) =>
    category.items.map((item) => ({ code: item.itemCode, name: item.nameAr })),
  );
  const action = setUpsellAction.bind(null, business.id, business.publicId);

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">اقتراحات البيع · Upsell</h1>
          <p className="admin__subtitle">
            Choose up to {MAX_PAIRINGS} dishes to suggest with each dish, and mark what is new. The
            menu suggests them when a customer opens a dish and in the cart.
          </p>
        </div>
        <Link href={`/admin/businesses/${business.id}`} className="admin__button admin__button--secondary">
          Back to restaurant
        </Link>
      </header>

      {options.length === 0 ? (
        <section className="admin__panel">
          <p className="admin__empty">Add dishes to the menu first.</p>
        </section>
      ) : (
        categories
          .filter((category) => category.items.length > 0)
          .map((category) => (
            <section key={category.key} className="admin__panel">
              <h2 className="admin__panel-title">{category.name}</h2>
              <ul className="upsell">
                {category.items.map((item) => (
                  <UpsellRow
                    key={item.itemCode}
                    code={item.itemCode}
                    name={item.nameAr}
                    pairsWith={item.pairsWith}
                    isNew={item.tags.includes(NEW_TAG)}
                    options={options.filter((option) => option.code !== item.itemCode)}
                    max={MAX_PAIRINGS}
                    action={action}
                  />
                ))}
              </ul>
            </section>
          ))
      )}
    </>
  );
}
