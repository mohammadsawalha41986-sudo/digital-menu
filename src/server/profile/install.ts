import type { PublicProfile } from './types';

/**
 * The web app manifest for one restaurant's menu: what a phone or a computer
 * shows when the menu is installed. Each restaurant has its own identity, so
 * two menus installed side by side stay apart (`id`, `start_url`, `scope`).
 */

export interface MenuManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  purpose?: string;
}

export interface MenuManifest {
  id: string;
  name: string;
  short_name: string;
  description?: string;
  lang: string;
  dir: 'rtl' | 'ltr';
  start_url: string;
  scope: string;
  display: 'standalone';
  background_color: string;
  theme_color: string;
  icons: MenuManifestIcon[];
}

/** The short label a home screen has room for. */
function shortName(name: string): string {
  return name.length <= 12 ? name : `${name.slice(0, 11)}…`;
}

export function menuManifest(profile: PublicProfile): MenuManifest {
  const arabic = profile.defaultLocale !== 'en';
  const name = arabic ? profile.nameAr : (profile.nameEn ?? profile.nameAr);
  const description = arabic
    ? (profile.descriptionAr ?? undefined)
    : (profile.descriptionEn ?? profile.descriptionAr ?? undefined);
  const base = `/m/${profile.publicId}`;

  // The restaurant's own logo as the icon. Without one, the platform's default
  // icon. The logo's file type is left for the browser to read from the file.
  const icons: MenuManifestIcon[] = profile.logo
    ? [
        { src: profile.logo.url, sizes: '192x192', purpose: 'any' },
        { src: profile.logo.url, sizes: '512x512', purpose: 'any' },
      ]
    : [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];

  return {
    id: base,
    name,
    short_name: shortName(name),
    description,
    lang: arabic ? 'ar' : 'en',
    dir: arabic ? 'rtl' : 'ltr',
    start_url: base,
    scope: base,
    display: 'standalone',
    background_color: profile.brand.colorBackground,
    theme_color: profile.brand.colorPrimary,
    icons,
  };
}
