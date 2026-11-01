import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { MAX_PAIRINGS, NEW_TAG, getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { setAutoUpsellAction, setUpsellAction } from '@/server/admin/actions';
import { effectiveRole, suggestionsFor, type SuggestionCandidate } from '@/lib/upsell';
import { UpsellRow } from './upsell-row';
import { AutoUpsellSwitch } from './auto-upsell-switch';

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

  // What the menu suggests for each dish with no picks of its own, as the
  // customer's menu will work it out (src/lib/upsell.ts).
  const candidates: (SuggestionCandidate & { name: string })[] = business.menus.flatMap((menu) =>
    menu.categories.flatMap((category) => {
      const role = effectiveRole(category.role, category.key, category.nameAr, category.nameEn);
      return category.items
        .filter((item) => item.availability !== 'HIDDEN')
        .map((item) => ({
          id: item.itemCode,
          name: item.nameAr,
          role,
          featured: item.isFeatured,
          order: 0,
          orderable: item.availability !== 'UNAVAILABLE' && item.priceMinor !== null,
        }));
    }),
  );
  candidates.forEach((candidate, index) => {
    candidate.order = index;
  });
  const nameOf = new Map(candidates.map((candidate) => [candidate.id, candidate.name]));
  const autoFor = (code: string) => {
    const dish = candidates.find((candidate) => candidate.id === code);
    if (!dish) return [];
    return suggestionsFor(dish, candidates).map((id) => nameOf.get(id) ?? id);
  };

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">اقتراحات البيع · Upsell</h1>
          <p className="admin__subtitle">
            Choose up to {MAX_PAIRINGS} dishes to suggest with each dish, and mark what is new. The
            menu suggests them when a customer opens a dish and in the cart.
          </p>
          <p className="admin__hint">
            بدون اختيارات يقترح المنيو تلقائياً حسب نوع القسم: الرئيسي يقترح مشروباً وجانبياً وحلى، والجانبي يقترح مشروباً
            وحلى. · With no picks, the menu suggests by section type: a main suggests a drink, a side and a dessert.
          </p>
        </div>
        <Link href={`/admin/businesses/${business.id}`} className="admin__button admin__button--secondary">
          Back to restaurant
        </Link>
      </header>

      <AutoUpsellSwitch
        enabled={business.autoUpsell}
        action={setAutoUpsellAction.bind(null, business.id, business.publicId)}
      />

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
                    automaticLinks={item.pairsAuto}
                    isNew={item.tags.includes(NEW_TAG)}
                    options={options.filter((option) => option.code !== item.itemCode)}
                    max={MAX_PAIRINGS}
                    action={action}
                    automatic={business.autoUpsell && item.pairsWith.length === 0 ? autoFor(item.itemCode) : []}
                  />
                ))}
              </ul>
            </section>
          ))
      )}
    </>
  );
}
