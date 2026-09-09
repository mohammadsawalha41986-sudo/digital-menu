import { resolveDesign } from '@/menu-studio/resolve';
import { isKnownTheme } from '@/menu-studio/themes';
import type { PublicProfile } from './types';

/**
 * Apply a presentation-only override to a staff preview.
 *
 * Returning a new read model, instead of updating MenuDesign, is the safety
 * boundary behind "Preview": the operator can browse freely and discard the
 * choice without changing content, versions or the permanent QR destination.
 *
 * Only the theme and its layout are replaced. The typography, photography
 * style and density the operator has already chosen are carried over from the
 * stored row, because the question the preview answers is "what will my menu
 * look like in this theme", not "what does this theme look like with my
 * choices discarded". Resolution then falls back to the *new* theme for every
 * setting the operator has left on its default, so switching theme still
 * changes the fonts they never picked.
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
        ...menu.designOverrides,
        themeKey,
        layoutKey: layoutKey ?? 'a',
      }),
    })),
  };
}
