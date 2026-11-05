/**
 * How one section of the menu lays out its dishes. The restaurant picks a
 * style per section; `auto` (the default) follows the restaurant-wide layout,
 * in the same columns as every other section; a lone dish gets a compact
 * wide card.
 */
export const SECTION_STYLES = ['auto', 'grid', 'large', 'list', 'carousel', 'featured'] as const;
export type SectionStyle = (typeof SECTION_STYLES)[number];

export function isSectionStyle(value: unknown): value is SectionStyle {
  return typeof value === 'string' && (SECTION_STYLES as readonly string[]).includes(value);
}

/** A run of cards: a grid with its columns, or the two-up large photos. */
export type CardRun = { kind: 'grid'; columns: string } | { kind: 'large' };

/** What the section is drawn as, once the style meets the dish count. */
export type SectionLayout =
  | CardRun
  | { kind: 'list' }
  | { kind: 'carousel' }
  /** The first dish drawn wide (photo beside the text), the rest below it. */
  | { kind: 'featured'; rest: CardRun | null };

/**
 * The one column system every grid section uses, whatever its dish count:
 * one column below 360px, two up to `lg` (phones and tablets), three to `xl`,
 * four above. A short section keeps normal-sized cards and leaves the rest of
 * its row empty rather than stretching two dishes across the screen.
 */
export const GRID_COLUMNS = 'grid-cols-2 max-[359px]:grid-cols-1 lg:grid-cols-3 xl:grid-cols-4';

const grid: CardRun = { kind: 'grid', columns: GRID_COLUMNS };

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
      // A lone dish gets one compact card with its photo beside the text
      // (stacked on a phone). Otherwise the restaurant-wide layout, at any
      // count: no dish is singled out.
      if (count === 1) return featured(1);
      if (fallback === 'list') return { kind: 'list' };
      if (fallback === 'large') return { kind: 'large' };
      return grid;
  }
}
