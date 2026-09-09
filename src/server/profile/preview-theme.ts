import { resolveDesign } from '@/menu-studio/resolve';
import { isKnownTheme } from '@/menu-studio/themes';
import type { PublicProfile } from './types';

/**
 * Apply a presentation-only override to a staff preview.
 *
 * Returning a new read model, instead of updating MenuDesign, is the safety
 * boundary behind "Preview": the operator can browse freely and discard the
 * choice without changing content, versions or the permanent QR destination.
 */
export function withPreviewTheme(
  profile: PublicProfile,
  themeKey: string | null,
  layoutKey: string | null,
): PublicProfile {
  if (!themeKey || !isKnownTheme(themeKey, layoutKey ?? undefined)) return profile;

  return {
    ...profile,
    menus: profile.menus.map((menu) => ({
      ...menu,
      design: resolveDesign({
        themeKey,
        layoutKey: layoutKey ?? 'a',
        fontHeading: null,
        fontBody: null,
        fontPrice: null,
        fontAccent: null,
        imageStyle: null,
        density: null,
        showPrices: menu.design.showPrices,
        showImages: menu.design.showImages,
        showCalories: menu.design.showCalories,
      }),
    })),
  };
}
