import { describe, expect, it } from 'vitest';
import { resolveSectionLayout } from '@/templates/street-food/sabah/section-layout';

// The grid's columns are drawn by sabah.css from the width the menu gives it
// (e2e/grid-layout.spec.ts pins them); here only the choice of layout.
const grid = { kind: 'grid' };

describe('section layout', () => {
  it('every grid section is the same adaptive grid, whatever its dish count', () => {
    for (let count = 1; count <= 9; count += 1) {
      expect(resolveSectionLayout('auto', 'grid', count)).toEqual(grid);
    }
    for (let count = 1; count <= 9; count += 1) {
      expect(resolveSectionLayout('grid', 'large', count)).toEqual(grid);
    }
  });

  it('auto: a lone dish is a grid of one, whose last-card rule draws it as one compact horizontal card', () => {
    expect(resolveSectionLayout('auto', 'grid', 1)).toEqual(grid);
    expect(resolveSectionLayout('auto', 'large', 1)).toEqual(grid);
    expect(resolveSectionLayout('auto', 'list', 1)).toEqual(grid);
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
