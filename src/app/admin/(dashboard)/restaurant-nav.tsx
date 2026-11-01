'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './restaurant-nav.css';

/**
 * The navigation every page of one restaurant shares: where you are (the
 * breadcrumb), one way back, and the main areas as tabs.
 *
 * It works from the path alone, so every page gets the same strip without each
 * page deciding its own back link. The hub is the restaurant's home; every
 * other page goes back to the hub, and the hub goes back to the list.
 */

const PAGE_LABELS: Record<string, string> = {
  builder: 'الأطباق · Dishes',
  images: 'صور الأطباق · Photos',
  details: 'التفاصيل · Details',
  brand: 'العلامة · Brand',
  review: 'مراجعة ونشر · Review',
  qr: 'رمز QR · QR',
  share: 'الروابط · Links',
  analytics: 'الإحصائيات · Analytics',
  options: 'الخيارات · Options',
  upsell: 'الاقتراحات · Upsell',
  sections: 'الأقسام · Sections',
  design: 'التصميم · Design',
  discounts: 'الخصومات · Discounts',
  offers: 'العروض · Offers',
  hours: 'أوقات العمل · Hours',
  branches: 'الفروع · Branches',
  menus: 'القوائم · Menus',
  media: 'الوسائط · Media',
  files: 'الملفات · Files',
  history: 'السجل · History',
  health: 'الاكتمال · Health',
  data: 'استيراد وتصدير · Import / export',
  nutrition: 'السعرات · Calories',
  quick: 'وضع الخدمة · Service mode',
  studio: 'الاستوديو · Studio',
  template: 'القالب · Template',
};

interface Tab {
  key: string;
  label: string;
  href: string;
  /** True on the tab's own pages, including their sub-pages. */
  active: (path: string) => boolean;
}

function within(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function tabsFor(id: string): Tab[] {
  const base = `/admin/businesses/${id}`;
  const build = `/admin/build/${id}`;
  return [
    { key: 'overview', label: 'الرئيسية · Overview', href: base, active: (p) => p === base },
    {
      key: 'dishes',
      label: 'الأطباق · Dishes',
      href: `${build}/builder`,
      active: (p) => within(p, `${build}/builder`) || within(p, `${build}/images`),
    },
    { key: 'options', label: 'الخيارات · Options', href: `${base}/options`, active: (p) => within(p, `${base}/options`) },
    { key: 'upsell', label: 'الاقتراحات · Upsell', href: `${base}/upsell`, active: (p) => within(p, `${base}/upsell`) },
    { key: 'sections', label: 'الأقسام · Sections', href: `${base}/sections`, active: (p) => within(p, `${base}/sections`) },
    { key: 'design', label: 'التصميم · Design', href: `${base}/design`, active: (p) => within(p, `${base}/design`) },
    { key: 'publish', label: 'النشر · Publish', href: `${build}/review`, active: (p) => within(p, `${build}/review`) },
    { key: 'qr', label: 'QR', href: `${base}/qr`, active: (p) => within(p, `${base}/qr`) },
    { key: 'analytics', label: 'الإحصائيات · Analytics', href: `${base}/analytics`, active: (p) => within(p, `${base}/analytics`) },
  ];
}

export function RestaurantNav({
  businessId,
  name,
  live,
}: {
  businessId: string;
  name: string;
  live: boolean;
}) {
  const pathname = usePathname();
  const base = `/admin/businesses/${businessId}`;
  const onHub = pathname === base;

  // The page within this restaurant: the first segment after the id, for both
  // the hub routes and the builder routes.
  const match = new RegExp(`^/admin/(?:businesses|build)/${businessId}(?:/([^/]+))?`).exec(pathname);
  const segment = match?.[1] ?? '';
  const pageLabel = PAGE_LABELS[segment] ?? segment;

  const back = onHub
    ? { href: '/admin/businesses', label: 'المطاعم · Restaurants' }
    : { href: base, label: 'المطعم · Restaurant' };

  return (
    <nav className="rnav" aria-label="Restaurant navigation">
      <div className="rnav__bar">
        <Link href={back.href} className="rnav__back">
          <span className="rnav__arrow" aria-hidden="true">
            ←
          </span>
          <span>رجوع إلى {back.label}</span>
        </Link>

        <nav aria-label="Breadcrumb">
        <ol className="rnav__crumbs">
          <li>
            <Link href="/admin/businesses">المطاعم · Restaurants</Link>
          </li>
          <li>
            {onHub ? (
              <span aria-current="page">{name}</span>
            ) : (
              <Link href={base}>{name}</Link>
            )}
          </li>
          {onHub || !pageLabel ? null : <li aria-current="page">{pageLabel}</li>}
        </ol>
        </nav>

        <span className="rnav__status" data-live={live ? 'yes' : 'no'}>
          {live ? 'منشور · Live' : 'غير منشور · Draft'}
        </span>
      </div>

      <ul className="rnav__tabs">
        {tabsFor(businessId).map((tab) => {
          const active = tab.active(pathname);
          return (
            <li key={tab.key}>
              <Link href={tab.href} className="rnav__tab" aria-current={active ? 'page' : undefined}>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
