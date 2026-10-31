/**
 * How one section of the menu lays out its dishes. The restaurant picks a
 * style per section; `auto` (the default) arranges the dishes so the row is
 * filled, whatever their number: a section of two juices should not sit in
 * one corner of a four-column grid with the rest of the width empty.
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
 * Grid columns that fit `count` cards: never more columns than cards, so a
 * short section spans the width instead of leaving a gap at the end.
 */
export function gridColumns(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-2';
  if (count === 3) return 'grid-cols-2 lg:grid-cols-3';
  if (count === 4) return 'grid-cols-2 lg:grid-cols-4';
  return 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
}

const grid = (count: number): CardRun => ({ kind: 'grid', columns: gridColumns(count) });

/** One wide dish, then `rest` for the others (nothing when it was the only one). */
const featured = (count: number, rest: (n: number) => CardRun): SectionLayout => ({
  kind: 'featured',
  rest: count > 1 ? rest(count - 1) : null,
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
      return grid(count);
    case 'large':
      return count === 1 ? featured(1, grid) : { kind: 'large' };
    case 'list':
      return { kind: 'list' };
    case 'carousel':
      // Too few dishes to scroll: show them whole instead.
      return count < 3 ? grid(count) : { kind: 'carousel' };
    case 'featured':
      return featured(count, grid);
    case 'auto':
      if (count === 1) return featured(1, grid);
      if (fallback === 'list') return { kind: 'list' };
      if (fallback === 'large') {
        // Two-up rows: an odd count leads with one wide dish.
        return count % 2 === 1 ? featured(count, () => ({ kind: 'large' })) : { kind: 'large' };
      }
      // Two-up on a phone too: an odd count would leave a hole in the last
      // row, so the first dish goes wide and the rest pair up.
      return count % 2 === 1 ? featured(count, grid) : grid(count);
  }
}
