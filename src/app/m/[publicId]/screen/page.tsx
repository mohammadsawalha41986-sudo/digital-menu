import { notFound } from 'next/navigation';
import { getPublicProfile } from '@/server/profile/repository';
import { resolveRequestLocale, type SearchParams } from '@/server/profile/render';
import { bcp47Of, directionOf } from '@/i18n/config';
import { brandTokensToStyle } from '@/design/brand';
import { renderQr } from '@/server/qr/service';
import { profileToSabah } from '@/templates/street-food/profile-to-sabah';
import { MenuScreen } from './menu-screen';
import './screen.css';

export const dynamic = 'force-dynamic';

export const metadata = { robots: { index: false, follow: false } };

/**
 * The menu as a display screen — for a TV or a menu board in the restaurant.
 *
 * It runs on its own: dishes turn on a 3D ring, categories flip in turn, and
 * a QR code in the corner takes a customer from the screen to the phone menu.
 * Same data, brand and photographs as `/m/{publicId}`; nothing to configure.
 *
 * `?seconds=` sets how long each dish faces forward (3–30, default 5) and
 * `?category=` pins one category, for a screen that shows only drinks.
 */
export default async function MenuScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { publicId } = await params;
  const resolved = await searchParams;

  const profile = await getPublicProfile(publicId);
  if (!profile) notFound();

  const locale = await resolveRequestLocale(resolved, profile.defaultLocale);
  const { restaurantInfo, menuCategories, menuItems, logoUrl } = profileToSabah(profile);

  const qrDataUri = await renderQr({ publicId: profile.publicId, sizePx: 300 })
    .then((qr) => `data:image/svg+xml;utf8,${encodeURIComponent(qr.svg)}`)
    .catch(() => null);

  const seconds = Math.min(30, Math.max(3, Number(resolved.seconds) || 5));
  const pinned = typeof resolved.category === 'string' ? resolved.category : null;

  return (
    <main
      className="menu-screen"
      lang={bcp47Of(locale)}
      dir={directionOf(locale)}
      data-menu-screen={profile.publicId}
      style={brandTokensToStyle(profile.brand)}
    >
      <MenuScreen
        lang={locale}
        info={restaurantInfo}
        categories={pinned ? menuCategories.filter((category) => category.id === pinned) : menuCategories}
        items={menuItems.filter((item) => !item.isUnavailable)}
        logoUrl={logoUrl}
        qrDataUri={qrDataUri}
        seconds={seconds}
      />
    </main>
  );
}
