import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { updateBusinessAction } from '@/server/admin/actions';
import { resolveTemplate } from '@/templates/registry';
import { BusinessForm } from './business-form';

export const dynamic = 'force-dynamic';

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();

  // A business the user has no grant for is "not found", never "forbidden":
  // the admin UI must not confirm that an id exists (master spec §128).
  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const itemCount = business.menus.reduce(
    (total, menu) =>
      total + menu.categories.reduce((count, category) => count + category.items.length, 0),
    0,
  );

  const base = `/admin/businesses/${business.id}`;
  const build = `/admin/build/${business.id}`;
  const { variant } = resolveTemplate(business.templateKey, business.variantKey);

  // Grouped the way an owner thinks about their restaurant, not the way the
  // routes are organised. Each group answers one question.
  const groups: { title: string; hint: string; links: HubLink[] }[] = [
    {
      title: 'المنيو · Menu',
      hint: 'Dishes, prices and photos.',
      links: [
        { href: `${build}/builder`, label: 'الأطباق والأسعار', sub: 'Dishes & prices', primary: true },
        { href: `${build}/images`, label: 'صور الأطباق', sub: 'Dish photos' },
        { href: `${base}/upsell`, label: 'اقتراحات البيع', sub: 'Upsell: pairings & new dishes' },
        { href: `${base}/data`, label: 'استيراد / تصدير', sub: 'Import / export (Excel)' },
        { href: `${base}/nutrition`, label: 'السعرات', sub: 'Calories' },
      ],
    },
    {
      title: 'التصميم · Design',
      hint: 'Logo, colours, fonts and how photos are shown.',
      links: [
        { href: `${base}/design`, label: 'الشعار والألوان والخطوط', sub: `Design — ${variant.label}`, primary: true },
        { href: `${base}/sections`, label: 'شكل الأقسام', sub: 'Section layouts: each section its own look' },
      ],
    },
    {
      title: 'معلومات المطعم · Restaurant info',
      hint: 'What a visitor needs to reach you.',
      links: [
        { href: '#details', label: 'الاسم والتواصل', sub: 'Name, phone, WhatsApp, address' },
        { href: `${base}/hours`, label: 'أوقات العمل', sub: 'Opening hours' },
        { href: `${base}/branches`, label: `الفروع (${business.branches.length})`, sub: 'Branches' },
      ],
    },
    {
      title: 'النشر والمشاركة · Publish & share',
      hint: 'Go live, print the QR, see visits.',
      links: [
        { href: `${build}/review`, label: 'مراجعة ونشر', sub: 'Review & publish', primary: true },
        { href: `${base}/qr`, label: 'رمز QR', sub: 'QR codes' },
        {
          href: `/m/${business.publicId}/screen`,
          label: 'شاشة العرض',
          sub: 'TV / display screen — 3D motion menu',
          newTab: true,
        },
        { href: `${base}/share`, label: 'الروابط والتضمين', sub: 'Links & embed' },
        { href: `${base}/analytics`, label: 'الإحصائيات', sub: 'Analytics' },
      ],
    },
  ];

  // Useful, but not part of the everyday flow. Offers are managed here while
  // the menu design does not yet show restaurant-level offers.
  const advanced: HubLink[] = [
    { href: `${base}/menus`, label: `Menus (${business.menus.length})`, sub: 'Several menus, versions' },
    { href: `${base}/offers`, label: 'Offers', sub: 'Not shown on the menu design yet' },
    { href: `${base}/quick`, label: 'Service mode', sub: 'Mark dishes sold out fast' },
    { href: `${base}/review`, label: 'Client review', sub: 'Share a draft for approval' },
    { href: `${base}/health`, label: 'Profile health', sub: 'What is missing' },
    { href: `${base}/history`, label: 'History', sub: 'Who changed what' },
    { href: `${base}/media`, label: 'Media library', sub: 'All uploaded images' },
    { href: `${base}/files`, label: 'Files', sub: 'PDFs and documents' },
  ];

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">{business.nameEn ?? business.nameAr}</h1>
          <p className="admin__subtitle">
            {business.status === 'ACTIVE' ? 'منشور · Live' : 'غير منشور · Not published'} —{' '}
            <Link href={`/m/${business.publicId}`} target="_blank" rel="noreferrer">
              /m/{business.publicId}
            </Link>{' '}
            (permanent link, used by the QR code)
          </p>
        </div>
        <Link href={`/m/${business.publicId}`} target="_blank" rel="noreferrer" className="admin__button">
          عرض المنيو · View menu
        </Link>
      </header>

      <section className="admin__cards" aria-label="Summary">
        <div className="admin__card">
          <span className="admin__metric">{itemCount}</span>
          <span className="admin__metric-label">Dishes</span>
        </div>
        <div className="admin__card">
          <span className="admin__metric">{business.branches.length}</span>
          <span className="admin__metric-label">Branches</span>
        </div>
        <div className="admin__card">
          <span className="admin__metric-label">Photo layout</span>
          <span>{variant.label}</span>
        </div>
      </section>

      <div className="hub">
        {groups.map((group) => (
          <section key={group.title} className="hub__group">
            <h2 className="hub__title">{group.title}</h2>
            <p className="admin__hint">{group.hint}</p>
            <div className="hub__links">
              {group.links.map((link) => (
                <HubTile key={link.href} link={link} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <details className="hub__advanced">
        <summary>أدوات متقدمة · More tools</summary>
        <div className="hub__links">
          {advanced.map((link) => (
            <HubTile key={link.href} link={link} />
          ))}
        </div>
      </details>

      <section className="admin__panel" id="details">
        <h2 className="admin__panel-title">الاسم والتواصل · Restaurant details</h2>
        <BusinessForm
          business={business}
          action={updateBusinessAction.bind(null, business.id)}
          submitLabel="Save business"
        />
      </section>
    </>
  );
}

interface HubLink {
  href: string;
  label: string;
  sub: string;
  primary?: boolean;
  /** Opens in a new tab — for pages that run on another screen. */
  newTab?: boolean;
}

function HubTile({ link }: { link: HubLink }) {
  return (
    <Link
      href={link.href}
      className="hub__tile"
      data-primary={link.primary ? '' : undefined}
      {...(link.newTab ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      <span className="hub__tile-label">{link.label}</span>
      <span className="hub__tile-sub">{link.sub}</span>
    </Link>
  );
}
