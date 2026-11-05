import { describe, expect, it } from 'vitest';
import { GRID_COLUMNS, resolveSectionLayout } from '@/templates/street-food/sabah/section-layout';

const grid = { kind: 'grid', columns: GRID_COLUMNS };

describe('section layout', () => {
  it('one column system: 1 below 360px, 2 on phones and tablets, 3 from lg, 4 from xl', () => {
    expect(GRID_COLUMNS.split(' ').sort()).toEqual(
      ['grid-cols-2', 'max-[359px]:grid-cols-1', 'lg:grid-cols-3', 'xl:grid-cols-4'].sort(),
    );
  });

  it('every grid section takes the same columns, whatever its dish count', () => {
    for (let count = 2; count <= 9; count += 1) {
      expect(resolveSectionLayout('auto', 'grid', count)).toEqual(grid);
    }
    for (let count = 1; count <= 9; count += 1) {
      expect(resolveSectionLayout('grid', 'large', count)).toEqual(grid);
    }
  });

  it('auto: a lone dish gets one compact wide card', () => {
    expect(resolveSectionLayout('auto', 'grid', 1)).toEqual({ kind: 'featured', rest: null });
    expect(resolveSectionLayout('auto', 'large', 1)).toEqual({ kind: 'featured', rest: null });
    expect(resolveSectionLayout('auto', 'list', 1)).toEqual({ kind: 'featured', rest: null });
  });

  it('auto never leads with a wide dish: it follows the restaurant-wide layout, odd counts included', () => {
    expect(resolveSectionLayout('auto', 'grid', 3)).toEqual(grid);
    expect(resolveSectionLayout('auto', 'grid', 5)).toEqual(grid);
    expect(resolveSectionLayout('auto', 'large', 2)).toEqual({ kind: 'large' });
    expect(resolveSectionLayout('auto', 'large', 3)).toEqual({ kind: 'large' });
    expect(resolveSectionLayout('auto', 'list', 4)).toEqual({ kind: 'list' });
  });

  it('keeps the restaurant’s explicit choice', () => {
    expect(resolveSectionLayout('list', 'grid', 1)).toEqual({ kind: 'list' });
    expect(resolveSectionLayout('large', 'grid', 4)).toEqual({ kind: 'large' });
    expect(resolveSectionLayout('large', 'grid', 1)).toEqual({ kind: 'featured', rest: null });
    expect(resolveSectionLayout('featured', 'grid', 4)).toEqual({ kind: 'featured', rest: grid });
    expect(resolveSectionLayout('featured', 'grid', 1)).toEqual({ kind: 'featured', rest: null });
    expect(resolveSectionLayout('carousel', 'grid', 6)).toEqual({ kind: 'carousel' });
  });

  it('a slider with too few dishes to scroll shows them whole', () => {
    expect(resolveSectionLayout('carousel', 'grid', 2)).toEqual(grid);
  });
});
