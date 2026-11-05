/**
 * How one section of the menu lays out its dishes. The restaurant picks a
 * style per section; `auto` (the default) follows the restaurant-wide layout,
 * in the same adaptive grid as every other section.
 */
export const SECTION_STYLES = ['auto', 'grid', 'large', 'list', 'carousel', 'featured'] as const;
export type SectionStyle = (typeof SECTION_STYLES)[number];

export function isSectionStyle(value: unknown): value is SectionStyle {
  return typeof value === 'string' && (SECTION_STYLES as readonly string[]).includes(value);
}

/**
 * A run of cards: the adaptive grid, or the two-up large photos.
 *
 * The grid's columns follow the width of the menu's content, not the screen
 * (sabah.css, `.sf-grid`): one below 300px, two to 900px (phones and portrait
 * tablets), three to 1150px, then four. A card left alone on the last row is
 * drawn as one horizontal card across two columns (the whole row on a phone),
 * so no section ends on a half-empty row; the dishes keep their order.
 */
export type CardRun = { kind: 'grid' } | { kind: 'large' };

/** What the section is drawn as, once the style meets the dish count. */
export type SectionLayout =
  | CardRun
  | { kind: 'list' }
  | { kind: 'carousel' }
  /** The first dish drawn wide (photo beside the text), the rest below it. */
  | { kind: 'featured'; rest: CardRun | null };

const grid: CardRun = { kind: 'grid' };

/** One wide dish, then the grid for the others (nothing when it was the only one). */
const featured = (count: number): SectionLayout => ({
  kind: 'featured',
  rest: count > 1 ? grid : null,
});

/**
 * @param style the restaurant's choice for this section
 * @param fallback the restaurant-wide photo layout, which `auto` follows
 * @param count the dishes the visitor sees in the section right now
 */
export function resolveSectionLayout(
  style: SectionStyle,
  fallback: 'grid' | 'large' | 'list',
  count: number,
): SectionLayout {
  switch (style) {
    case 'grid':
      return grid;
    case 'large':
      return count === 1 ? featured(1) : { kind: 'large' };
    case 'list':
      return { kind: 'list' };
    case 'carousel':
      // Too few dishes to scroll: show them whole instead.
      return count < 3 ? grid : { kind: 'carousel' };
    case 'featured':
      return featured(count);
    case 'auto':
      // The restaurant-wide layout, at any count: no dish is singled out. A
      // lone dish in the grid is its last card, so it is drawn as one compact
      // horizontal card.
      if (count === 1) return grid;
      if (fallback === 'list') return { kind: 'list' };
      if (fallback === 'large') return { kind: 'large' };
      return grid;
  }
}
