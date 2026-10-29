import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { setSectionStylesAction } from '@/server/admin/actions';
import { isSectionStyle } from '@/templates/street-food/sabah/section-layout';
import { SectionsForm } from './sections-form';

export const dynamic = 'force-dynamic';

/**
 * Section layouts: how each section of the menu shows its dishes. A section
 * can look different from the one before it, and `auto` arranges a short
 * section so its row is filled instead of leaving empty space.
 */
export default async function SectionsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const sections = business.menus.flatMap((menu) =>
    menu.categories.map((category) => ({
      id: category.id,
      name: category.nameAr,
      nameEn: category.nameEn,
      dishes: category.items.filter((item) => item.availability !== 'HIDDEN').length,
      active: category.isActive,
      style: isSectionStyle(category.displayStyle) ? category.displayStyle : 'auto',
    })),
  );

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">شكل الأقسام · Section layouts</h1>
          <p className="admin__subtitle">
            اختر طريقة عرض كل قسم في المنيو. «تلقائي» يرتّب الأطباق حسب عددها ليملأ العرض بدون
            فراغات. Choose how each section shows its dishes; Auto fills the row whatever the count.
          </p>
        </div>
        <div className="admin__actions">
          <a
            href={`/m/${business.publicId}`}
            target="_blank"
            rel="noreferrer"
            className="admin__button admin__button--secondary"
          >
            معاينة المنيو · Preview
          </a>
          <Link href={`/admin/businesses/${business.id}`} className="admin__button admin__button--secondary">
            Back to restaurant
          </Link>
        </div>
      </header>

      {sections.length === 0 ? (
        <section className="admin__panel">
          <p className="admin__empty">Add sections to the menu first.</p>
        </section>
      ) : (
        <SectionsForm
          sections={sections}
          action={setSectionStylesAction.bind(null, business.id, business.publicId)}
        />
      )}
    </>
  );
}
