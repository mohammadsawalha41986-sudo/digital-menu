import { resolveTheme } from './themes';
import { resolveFont } from './typography';
import type { PublicMenuDesign } from '@/server/profile/types';

/**
 * Turns a stored design row into the values a page renders with.
 *
 * Resolution order per setting: what the operator chose for this menu, then
 * what the theme specifies, then the platform default. A null in the row means
 * "use the theme's own choice" — it is a real value, not a missing one.
 *
 * Nothing here reads menu content, which is the property that makes a theme
 * switch incapable of changing a price.
 */
export interface DesignRowLike {
  themeKey: string;
  layoutKey: string;
  fontHeading: string | null;
  fontBody: string | null;
  fontPrice: string | null;
  fontAccent: string | null;
  imageStyle: string | null;
  density: string | null;
  showPrices: boolean;
  showImages: boolean;
  showCalories: boolean;
}

export const UNSTYLED: DesignRowLike = {
  themeKey: 'modern-minimal',
  layoutKey: 'a',
  fontHeading: null,
  fontBody: null,
  fontPrice: null,
  fontAccent: null,
  imageStyle: null,
  density: null,
  showPrices: true,
  showImages: true,
  showCalories: true,
};

export function resolveDesign(row: DesignRowLike | null | undefined): PublicMenuDesign {
  const design = row ?? UNSTYLED;
  const { theme, layout } = resolveTheme(design.themeKey, design.layoutKey);

  const font = (chosen: string | null, themeChoice: string) =>
    resolveFont(chosen ?? themeChoice, themeChoice).stack;

  // "Hide photographs" wins over any image treatment: an operator switching
  // images off must not have a theme quietly turn them back on.
  const imageStyle = !design.showImages
    ? 'none'
    : (design.imageStyle ?? layout.imageStyle);

  return {
    themeKey: theme.key,
    layoutKey: layout.key,
    fonts: {
      heading: font(design.fontHeading, theme.typography.heading),
      body: font(design.fontBody, theme.typography.body),
      price: font(design.fontPrice, theme.typography.price),
      accent: font(design.fontAccent, theme.typography.accent),
    },
    imageStyle,
    density: design.density ?? theme.density,
    categoryStyle: theme.categoryStyle,
    priceStyle: theme.priceStyle,
    itemStyle: layout.itemStyle,
    borders: theme.borders,
    headingTransform: theme.typography.headingTransform,
    headingTracking: theme.typography.headingTracking,
    scale: theme.typography.scale,
    showPrices: design.showPrices,
    showImages: design.showImages,
    showCalories: design.showCalories,
  };
}

/** The custom properties and data attributes a themed menu section carries. */
export function designToAttributes(design: PublicMenuDesign) {
  return {
    'data-menu-theme': design.themeKey,
    'data-menu-layout': design.layoutKey,
    'data-item-style': design.itemStyle,
    'data-image-style': design.imageStyle,
    'data-price-style': design.priceStyle,
    'data-category-style': design.categoryStyle,
    'data-density': design.density,
    'data-borders': design.borders,
    style: {
      '--menu-font-heading': design.fonts.heading,
      '--menu-font-body': design.fonts.body,
      '--menu-font-price': design.fonts.price,
      '--menu-font-accent': design.fonts.accent,
      '--menu-scale': String(design.scale),
      '--menu-heading-transform': design.headingTransform,
      '--menu-heading-tracking':
        design.headingTracking === 'tight'
          ? '-0.02em'
          : design.headingTracking === 'wide'
            ? '0.08em'
            : '0',
    } as React.CSSProperties,
  };
}
