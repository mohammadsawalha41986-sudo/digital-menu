import type { MenuTheme } from './types';

/**
 * The theme catalogue (Menu Studio §3, §34).
 *
 * Each theme differs in *composition* — how a category announces itself, how
 * an item is set, where the price sits, whether photography leads or supports.
 * Recolouring is not a theme (the colours come from the brand preset), so two
 * entries that differ only in palette would be the same theme twice, and this
 * file would be lying about having ten.
 *
 * Themes carry no restaurant identity: the names describe visual concepts, not
 * businesses (§34).
 */

const EMBER_EDITORIAL: MenuTheme = {
  key: 'ember-editorial',
  label: 'Ember Editorial',
  description:
    'Magazine composition: an oversized masthead, a category index that stays with the reader, and item rows separated by rules rather than boxed into cards. Photography is occasional and large.',
  tonePreference: 'light',
  typography: {
    heading: 'system-serif',
    body: 'system-sans',
    price: 'system-sans',
    accent: 'system-serif',
    scale: 1.15,
    headingTransform: 'none',
    headingTracking: 'tight',
  },
  density: 'airy',
  categoryStyle: 'index',
  priceStyle: 'trailing',
  borders: 'rule',
  decorations: ['none'],
  suits: ['warm', 'premium'],
  layouts: [
    {
      key: 'a',
      label: 'Single column',
      description: 'One measure, generous leading, hero photograph above the first category.',
      columns: 1,
      itemStyle: 'editorial',
      imageStyle: 'editorial',
      hero: true,
    },
    {
      key: 'b',
      label: 'Two column',
      description: 'Two columns from tablet up, images reduced to support the text.',
      columns: 2,
      itemStyle: 'row',
      imageStyle: 'thumbnail',
      hero: false,
    },
  ],
};

const DARK_LUXURY: MenuTheme = {
  key: 'dark-luxury',
  label: 'Dark Luxury',
  description:
    'A dark page with ceremonial spacing. Categories are announced centred with no navigation, items are set as centred stanzas, and at most one photograph appears per category.',
  tonePreference: 'dark',
  typography: {
    heading: 'arabic-naskh',
    body: 'system-serif',
    price: 'system-serif',
    accent: 'system-serif',
    scale: 1.1,
    headingTransform: 'uppercase',
    headingTracking: 'wide',
  },
  density: 'airy',
  categoryStyle: 'stacked',
  priceStyle: 'stacked',
  borders: 'hairline',
  decorations: ['corner-marks'],
  suits: ['premium', 'cool'],
  layouts: [
    {
      key: 'a',
      label: 'Ceremonial',
      description: 'Centred stanzas, wide margins, one image per category.',
      columns: 1,
      itemStyle: 'stanza',
      imageStyle: 'floating',
      hero: true,
    },
    {
      key: 'b',
      label: 'Plated',
      description: 'Same stanzas without photography — typography carries the page.',
      columns: 1,
      itemStyle: 'stanza',
      imageStyle: 'none',
      hero: false,
    },
  ],
};

const MODERN_MEDITERRANEAN: MenuTheme = {
  key: 'modern-mediterranean',
  label: 'Modern Mediterranean',
  description:
    'Warm, open composition built on a three-column grid at width. Categories become banners with their own photograph; items sit in a cardless grid with the price on the same baseline as the name.',
  tonePreference: 'light',
  typography: {
    heading: 'system-serif',
    body: 'system-sans',
    price: 'system-sans',
    accent: 'system-serif',
    scale: 1.05,
    headingTransform: 'none',
    headingTracking: 'normal',
  },
  density: 'regular',
  categoryStyle: 'banner',
  priceStyle: 'inline',
  borders: 'hairline',
  decorations: ['none'],
  suits: ['warm'],
  layouts: [
    {
      key: 'a',
      label: 'Grid',
      description: 'Three columns at width, square images, banner categories.',
      columns: 3,
      itemStyle: 'grid-cell',
      imageStyle: 'rounded',
      hero: true,
    },
    {
      key: 'b',
      label: 'Two column',
      description: 'Two columns, taller images.',
      columns: 2,
      itemStyle: 'grid-cell',
      imageStyle: 'rounded',
      hero: false,
    },
  ],
};

const ARABIC_CONTEMPORARY: MenuTheme = {
  key: 'arabic-contemporary',
  label: 'Arabic Contemporary',
  description:
    'RTL-first composition, not a mirrored Latin one: the category index runs along the inline start, headings are set in geometric Kufi, and the price sits at the inline end where an Arabic reader finishes the line. Geometric rules replace ornament.',
  tonePreference: 'either',
  typography: {
    heading: 'arabic-kufi',
    body: 'arabic-naskh',
    price: 'system-sans',
    accent: 'arabic-kufi',
    scale: 1.1,
    headingTransform: 'none',
    headingTracking: 'normal',
  },
  density: 'regular',
  categoryStyle: 'tab',
  priceStyle: 'trailing',
  borders: 'rule',
  decorations: ['geometric'],
  suits: ['warm', 'premium', 'bold'],
  layouts: [
    {
      key: 'a',
      label: 'Editorial RTL',
      description: 'Single measure, geometric category rules, images inline with the text.',
      columns: 1,
      itemStyle: 'editorial',
      imageStyle: 'rounded',
      hero: true,
    },
    {
      key: 'b',
      label: 'Two column RTL',
      description: 'Two columns reading right to left, thumbnails at the inline start.',
      columns: 2,
      itemStyle: 'row',
      imageStyle: 'thumbnail',
      hero: false,
    },
  ],
};

const BOLD_STREET: MenuTheme = {
  key: 'bold-street',
  label: 'Bold Street',
  description:
    'High-energy: full-bleed photography, headings at poster scale, prices as badges over the image. Categories arrive as full-width blocks that interrupt the scroll.',
  tonePreference: 'either',
  typography: {
    heading: 'system-display',
    body: 'system-sans',
    price: 'system-mono',
    accent: 'system-display',
    scale: 1.35,
    headingTransform: 'uppercase',
    headingTracking: 'tight',
  },
  density: 'compact',
  categoryStyle: 'banner',
  priceStyle: 'badge',
  borders: 'boxed',
  decorations: ['stamp'],
  suits: ['bold', 'playful', 'warm'],
  layouts: [
    {
      key: 'a',
      label: 'Full bleed',
      description: 'Edge-to-edge photography with the price badged over it.',
      columns: 1,
      itemStyle: 'card',
      imageStyle: 'full-bleed',
      hero: true,
    },
    {
      key: 'b',
      label: 'Poster grid',
      description: 'Two-column poster grid, cropped square.',
      columns: 2,
      itemStyle: 'card',
      imageStyle: 'grid',
      hero: false,
    },
  ],
};

const MINIMAL_LINE: MenuTheme = {
  key: 'minimal-line',
  label: 'Minimal Line',
  description:
    'Text only, by design: no photography anywhere, one line per item, the price reached by leader dots. Categories are set as small capitals with a hairline. The layout a long menu can actually use.',
  tonePreference: 'light',
  typography: {
    heading: 'system-sans',
    body: 'system-sans',
    price: 'system-mono',
    accent: 'system-sans',
    scale: 0.95,
    headingTransform: 'uppercase',
    headingTracking: 'wide',
  },
  density: 'compact',
  categoryStyle: 'rule',
  priceStyle: 'leader-dots',
  borders: 'hairline',
  decorations: ['none'],
  suits: ['minimal', 'cool'],
  layouts: [
    {
      key: 'a',
      label: 'Single column',
      description: 'One narrow measure, printed-card proportions.',
      columns: 1,
      itemStyle: 'row',
      imageStyle: 'none',
      hero: false,
    },
    {
      key: 'b',
      label: 'Two column',
      description: 'Two columns for menus that would otherwise run long.',
      columns: 2,
      itemStyle: 'row',
      imageStyle: 'none',
      hero: false,
    },
  ],
};

const PREMIUM_CAFE: MenuTheme = {
  key: 'premium-cafe',
  label: 'Premium Café',
  description:
    'Soft, papery composition. Categories are stacked headings, items are rows with a circular crop, and the price sits inline. Built for short menus read at a table.',
  tonePreference: 'light',
  typography: {
    heading: 'system-serif',
    body: 'system-sans',
    price: 'system-sans',
    accent: 'system-serif',
    scale: 1,
    headingTransform: 'none',
    headingTracking: 'normal',
  },
  density: 'regular',
  categoryStyle: 'stacked',
  priceStyle: 'inline',
  borders: 'hairline',
  decorations: ['flourish'],
  suits: ['warm', 'minimal'],
  layouts: [
    {
      key: 'a',
      label: 'Rows',
      description: 'Circular crops beside each item.',
      columns: 1,
      itemStyle: 'row',
      imageStyle: 'circle',
      hero: false,
    },
    {
      key: 'b',
      label: 'Board',
      description: 'Two columns, polaroid crops, denser rhythm.',
      columns: 2,
      itemStyle: 'row',
      imageStyle: 'polaroid',
      hero: false,
    },
  ],
};

const FINE_DINING: MenuTheme = {
  key: 'fine-dining',
  label: 'Fine Dining',
  description:
    'Typography only. Where Dark Luxury sets items as centred stanzas around a photograph, this sets them as a running editorial line — dish, then description, then the price quietly inline — with no photography in the primary layout and no rule anywhere on the page.',
  tonePreference: 'dark',
  typography: {
    heading: 'system-serif',
    body: 'system-serif',
    price: 'system-serif',
    accent: 'system-serif',
    scale: 1.2,
    headingTransform: 'none',
    headingTracking: 'wide',
  },
  density: 'airy',
  categoryStyle: 'stacked',
  priceStyle: 'inline',
  borders: 'none',
  decorations: ['none'],
  suits: ['premium', 'minimal'],
  layouts: [
    {
      key: 'a',
      label: 'Tasting',
      description: 'No photography at all. The dish and its price on one editorial line.',
      columns: 1,
      itemStyle: 'editorial',
      imageStyle: 'none',
      hero: false,
    },
    {
      key: 'b',
      label: 'Plated',
      description: 'The same page opened by a single full-width photograph.',
      columns: 1,
      itemStyle: 'editorial',
      imageStyle: 'full-bleed',
      hero: true,
    },
  ],
};

const FAST_CASUAL: MenuTheme = {
  key: 'fast-casual',
  label: 'Fast Casual',
  description:
    'Product-led: large photography, a clear hierarchy that puts the item name above everything, and a strongly weighted price. Categories become horizontal tabs that stay in reach on a phone.',
  tonePreference: 'light',
  typography: {
    heading: 'system-sans',
    body: 'system-sans',
    price: 'system-sans',
    accent: 'system-sans',
    scale: 1.05,
    headingTransform: 'none',
    headingTracking: 'normal',
  },
  density: 'regular',
  categoryStyle: 'tab',
  priceStyle: 'badge',
  borders: 'boxed',
  decorations: ['none'],
  suits: ['bold', 'playful'],
  layouts: [
    {
      key: 'a',
      label: 'Product grid',
      description: 'Two-column grid with large product photography.',
      columns: 2,
      itemStyle: 'card',
      imageStyle: 'grid',
      hero: true,
    },
    {
      key: 'b',
      label: 'Product rows',
      description: 'Single column rows with a large thumbnail.',
      columns: 1,
      itemStyle: 'card',
      imageStyle: 'rounded',
      hero: false,
    },
  ],
};

const MODERN_MINIMAL: MenuTheme = {
  key: 'modern-minimal',
  label: 'Modern Minimal',
  description:
    'The neutral default: clean sans typography, thin rules, strong hierarchy and no decoration. Chosen when nothing about a brand argues for something more particular.',
  tonePreference: 'either',
  typography: {
    heading: 'system-sans',
    body: 'system-sans',
    price: 'system-sans',
    accent: 'system-sans',
    scale: 1,
    headingTransform: 'none',
    headingTracking: 'normal',
  },
  density: 'regular',
  categoryStyle: 'rule',
  priceStyle: 'trailing',
  borders: 'hairline',
  decorations: ['none'],
  suits: ['minimal', 'cool', 'warm'],
  layouts: [
    {
      key: 'a',
      label: 'Rows',
      description: 'Single column with thumbnails.',
      columns: 1,
      itemStyle: 'row',
      imageStyle: 'thumbnail',
      hero: false,
    },
    {
      key: 'b',
      label: 'Two column',
      description: 'Two columns from tablet up.',
      columns: 2,
      itemStyle: 'row',
      imageStyle: 'thumbnail',
      hero: false,
    },
  ],
};

export const MENU_THEMES: readonly MenuTheme[] = [
  MODERN_MINIMAL,
  EMBER_EDITORIAL,
  DARK_LUXURY,
  MODERN_MEDITERRANEAN,
  ARABIC_CONTEMPORARY,
  BOLD_STREET,
  MINIMAL_LINE,
  PREMIUM_CAFE,
  FINE_DINING,
  FAST_CASUAL,
];
