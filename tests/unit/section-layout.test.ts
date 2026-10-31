import { describe, expect, it } from 'vitest';
import { gridColumns, resolveSectionLayout } from '@/templates/street-food/sabah/section-layout';

/** Columns a grid shows on the widest screen, read from its classes. */
const widest = (columns: string) => Number(columns.match(/(\d+)(?!.*\d)/)?.[1]);

describe('section layout', () => {
  it('never gives a grid more columns than it has dishes', () => {
    for (let count = 1; count <= 4; count += 1) {
      expect(widest(gridColumns(count))).toBeLessThanOrEqual(count);
    }
    expect(gridColumns(9)).toBe('grid-cols-2 lg:grid-cols-3 xl:grid-cols-4');
  });

  it('auto: a single dish goes wide, two fill the row two-up', () => {
    expect(resolveSectionLayout('auto', 'grid', 1)).toEqual({ kind: 'featured', rest: null });
    expect(resolveSectionLayout('auto', 'grid', 2)).toEqual({ kind: 'grid', columns: 'grid-cols-2' });
    expect(resolveSectionLayout('auto', 'large', 2)).toEqual({ kind: 'large' });
  });

  it('auto: an odd count leads with one wide dish so the two-up rows close', () => {
    expect(resolveSectionLayout('auto', 'grid', 3)).toEqual({
      kind: 'featured',
      rest: { kind: 'grid', columns: 'grid-cols-2' },
    });
    expect(resolveSectionLayout('auto', 'grid', 5)).toEqual({
      kind: 'featured',
      rest: { kind: 'grid', columns: 'grid-cols-2 lg:grid-cols-4' },
    });
    expect(resolveSectionLayout('auto', 'large', 3)).toEqual({ kind: 'featured', rest: { kind: 'large' } });
    expect(resolveSectionLayout('auto', 'grid', 8)).toEqual({ kind: 'grid', columns: gridColumns(8) });
  });

  it('auto follows a list menu, except for a lone dish', () => {
    expect(resolveSectionLayout('auto', 'list', 4)).toEqual({ kind: 'list' });
    expect(resolveSectionLayout('auto', 'list', 1)).toEqual({ kind: 'featured', rest: null });
  });

  it('keeps the restaurant’s explicit choice', () => {
    expect(resolveSectionLayout('list', 'grid', 1)).toEqual({ kind: 'list' });
    expect(resolveSectionLayout('grid', 'large', 3)).toEqual({ kind: 'grid', columns: 'grid-cols-2 lg:grid-cols-3' });
    expect(resolveSectionLayout('large', 'grid', 4)).toEqual({ kind: 'large' });
    expect(resolveSectionLayout('featured', 'grid', 4)).toEqual({
      kind: 'featured',
      rest: { kind: 'grid', columns: 'grid-cols-2 lg:grid-cols-3' },
    });
    expect(resolveSectionLayout('carousel', 'grid', 6)).toEqual({ kind: 'carousel' });
  });

  it('a slider with too few dishes to scroll shows them whole', () => {
    expect(resolveSectionLayout('carousel', 'grid', 2)).toEqual({ kind: 'grid', columns: 'grid-cols-2' });
  });
});
