import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { listOptionGroups } from '@/server/menu-studio/modifiers';
import { TenantAccessError } from '@/server/tenancy/context';
import { deleteOptionGroupAction, saveOptionGroupAction } from '@/server/admin/actions';
import { formatMinorAsDecimal } from '@/lib/money';
import { OptionsManager } from './options-manager';

export const dynamic = 'force-dynamic';

/**
 * Options & add-ons: sizes with their prices, required choices (rice type),
 * paid extras and swaps. A group is made once and put on as many dishes as
 * need it; the customer picks in the dish sheet and the choices travel with
 * the order to WhatsApp.
 */
export default async function OptionsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });
  const groups = await listOptionGroups(user, business.id);

  const sections = business.menus.flatMap((menu) =>
    menu.categories
      .map((category) => ({
        key: `${menu.key}:${category.key}`,
        name: category.nameAr,
        dishes: category.items
          .filter((item) => item.availability !== 'HIDDEN')
          .map((item) => ({ code: item.itemCode, name: item.nameAr })),
      }))
      .filter((section) => section.dishes.length > 0),
  );

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">الخيارات والإضافات · Options & add-ons</h1>
          <p className="admin__subtitle">
            الأحجام بأسعارها، الاختيارات الإجبارية مثل نوع الرز، الإضافات المدفوعة، والاستبدال مثل «رز بدل
            البطاطا». أنشئ المجموعة مرة واحدة وضعها على كل الأطباق التي تحتاجها.
          </p>
        </div>
        <div className="admin__actions">
          <a href={`/m/${business.publicId}`} target="_blank" rel="noreferrer" className="admin__button admin__button--secondary">
            معاينة المنيو · Preview
          </a>
          <Link href={`/admin/businesses/${business.id}`} className="admin__button admin__button--secondary">
            Back to restaurant
          </Link>
        </div>
      </header>

      {sections.length === 0 ? (
        <section className="admin__panel">
          <p className="admin__empty">Add dishes to the menu first.</p>
        </section>
      ) : (
        <OptionsManager
          currency={business.currency}
          sections={sections}
          groups={groups.map((group) => ({
            key: group.key,
            nameAr: group.nameAr,
            nameEn: group.nameEn ?? '',
            required: group.minSelect > 0,
            max: group.maxSelect,
            options: group.options.map((option) => ({
              key: option.key,
              nameAr: option.nameAr,
              nameEn: option.nameEn ?? '',
              price: option.priceDeltaMinor === 0 ? '' : formatMinorAsDecimal(option.priceDeltaMinor, business.currency),
              isDefault: option.isDefault,
            })),
            items: group.items.map((link) => link.item.itemCode),
          }))}
          saveAction={saveOptionGroupAction.bind(null, business.id, business.publicId)}
          deleteAction={deleteOptionGroupAction.bind(null, business.id, business.publicId)}
        />
      )}
    </>
  );
}
