/**
 * The theme configuration contract (Menu Studio §30).
 *
 * A theme is data. It holds no menu content, no business identity and no
 * component code — which is precisely what makes switching one safe: the
 * renderer reads these values, and the items, prices, categories, images and
 * modifiers it renders come from somewhere this object cannot reach.
 *
 * Colours are deliberately absent. They arrive from the business's brand
 * preset, so a theme never overrides a restaurant's identity with a designer's
 * preference (§7). A theme may state a *tone preference* — whether it was
 * composed for a dark or a light page — and the studio warns rather than
 * silently recolouring.
 */

export type ImageStyle =
  | 'none'
  | 'thumbnail'
  | 'rounded'
  | 'circle'
  | 'editorial'
  | 'full-bleed'
  | 'polaroid'
  | 'floating'
  | 'grid';

export type Density = 'compact' | 'regular' | 'airy';

export type CategoryStyle = 'rule' | 'banner' | 'stacked' | 'index' | 'tab';

export type PriceStyle = 'inline' | 'trailing' | 'leader-dots' | 'stacked' | 'badge';

export type ItemStyle = 'row' | 'stanza' | 'card' | 'grid-cell' | 'editorial';

export interface MenuThemeTypography {
  heading: string;
  body: string;
  price: string;
  accent: string;
  /** Multiplier applied to the base type scale. */
  scale: number;
  headingTransform: 'none' | 'uppercase';
  headingTracking: 'tight' | 'normal' | 'wide';
}

export interface MenuThemeLayout {
  key: string;
  label: string;
  description: string;
  columns: 1 | 2 | 3;
  itemStyle: ItemStyle;
  imageStyle: ImageStyle;
  /** A photograph above the first category. */
  hero: boolean;
}

export interface MenuTheme {
  key: string;
  label: string;
  /** What structurally distinguishes this theme — the answer to "why not the other one". */
  description: string;
  tonePreference: 'light' | 'dark' | 'either';
  typography: MenuThemeTypography;
  density: Density;
  categoryStyle: CategoryStyle;
  priceStyle: PriceStyle;
  /** Hairlines and dividers, as a fraction of the brand border colour. */
  borders: 'none' | 'hairline' | 'rule' | 'boxed';
  decorations: readonly ('none' | 'corner-marks' | 'geometric' | 'flourish' | 'stamp')[];
  layouts: readonly MenuThemeLayout[];
  /** Moods this theme suits, matched against a brand preset's measured mood. */
  suits: readonly string[];
}

export interface ResolvedMenuTheme {
  theme: MenuTheme;
  layout: MenuThemeLayout;
}
