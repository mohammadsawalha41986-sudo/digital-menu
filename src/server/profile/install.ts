import type { PublicProfile } from './types';

/**
 * The web app manifest for one restaurant's menu: what a phone or a computer
 * shows when the menu is installed. Each restaurant has its own identity, so
 * two menus installed side by side stay apart (`id`, `start_url`, `scope`).
 */

/** The icon sizes a browser asks for when it installs an app. */
export const APP_ICON_SIZES = [192, 512] as const;
export type AppIconSize = (typeof APP_ICON_SIZES)[number];

/** Where one icon size of a menu is served: a PNG this app renders itself. */
export function appIconPath(publicId: string, size: AppIconSize): string {
  return `/m/${publicId}/app-icon/${size}.png`;
}

/** Reads `192.png` or `512.png` from a route segment; anything else is not an icon. */
export function parseAppIconFile(file: string): AppIconSize | null {
  const match = /^(\d{3})\.png$/.exec(file);
  if (!match) return null;
  const size = Number(match[1]);
  return (APP_ICON_SIZES as readonly number[]).includes(size) ? (size as AppIconSize) : null;
}

export interface MenuManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
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

  // The icons are always PNGs this app renders from the logo: the logo is
  // centred on the brand colour at the exact size asked for and never
  // stretched. A logo that cannot be read gets the platform icon instead.
  const icons: MenuManifestIcon[] = APP_ICON_SIZES.map((size) => ({
    src: appIconPath(profile.publicId, size),
    sizes: `${size}x${size}`,
    type: 'image/png',
    purpose: 'any',
  }));

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
