import { describe, expect, it } from 'vitest';
import { inferRole } from '@/lib/upsell';
import { MAX_LINKS, automaticLinks, type LinkDish } from '@/server/admin/upsell-links';

function dish(overrides: Partial<LinkDish> & Pick<LinkDish, 'itemCode' | 'role' | 'order'>): LinkDish {
  return {
    availability: 'AVAILABLE',
    priceMinor: 1000,
    isFeatured: false,
    pairsWith: [],
    ...overrides,
  };
}

describe('section names the menu could not read before', () => {
  it.each([
    ['main', 'الأطباق الرئيسية', 'Main Course', 'MAIN'],
    ['mains', 'الأطباق', 'Mains', 'MAIN'],
    ['sandwiches', 'ساندويتشات المشاوي', 'Grilled Sandwiches', 'MAIN'],
    ['espresso', 'الإسبريسو', 'Espresso', 'DRINK'],
    ['filter', 'التقطير', 'Filter', 'DRINK'],
    ['juices', 'العصائر', 'Juices', 'DRINK'],
  ])('%s reads as %s', (key, ar, en, role) => {
    expect(inferRole(key, ar, en)).toBe(role);
  });
});

describe('automatic links', () => {
  it('links a main to one drink, one side and one dessert, featured first', () => {
    const menu = [
      dish({ itemCode: 'MAIN-1', role: 'MAIN', order: 0 }),
      dish({ itemCode: 'DRINK-A', role: 'DRINK', order: 1 }),
      dish({ itemCode: 'DRINK-B', role: 'DRINK', order: 2, isFeatured: true }),
      dish({ itemCode: 'SIDE-1', role: 'SIDE', order: 3 }),
      dish({ itemCode: 'DESSERT-1', role: 'DESSERT', order: 4 }),
    ];
    const links = automaticLinks(menu);
    expect(links.get('MAIN-1')).toEqual(['DRINK-B', 'SIDE-1', 'DESSERT-1']);
    expect(links.get('MAIN-1')?.length).toBeLessThanOrEqual(MAX_LINKS);
  });

  it('never gives a dish a link to itself', () => {
    const menu = [
      dish({ itemCode: 'D-1', role: 'DRINK', order: 0 }),
      dish({ itemCode: 'S-1', role: 'SIDE', order: 1 }),
      dish({ itemCode: 'T-1', role: 'DESSERT', order: 2 }),
    ];
    for (const [code, picks] of automaticLinks(menu)) expect(picks).not.toContain(code);
  });

  it('keeps a restaurant’s own picks: a dish with picks is not in the result', () => {
    const menu = [
      dish({ itemCode: 'MAIN-1', role: 'MAIN', order: 0, pairsWith: ['DRINK-A'] }),
      dish({ itemCode: 'DRINK-A', role: 'DRINK', order: 1 }),
      dish({ itemCode: 'SIDE-1', role: 'SIDE', order: 2 }),
    ];
    expect(automaticLinks(menu).has('MAIN-1')).toBe(false);
  });

  it('never suggests an unavailable dish or one with no price', () => {
    const menu = [
      dish({ itemCode: 'MAIN-1', role: 'MAIN', order: 0 }),
      dish({ itemCode: 'DRINK-OUT', role: 'DRINK', order: 1, availability: 'UNAVAILABLE' }),
      dish({ itemCode: 'DRINK-FREE', role: 'DRINK', order: 2, priceMinor: null }),
      dish({ itemCode: 'DRINK-OK', role: 'DRINK', order: 3 }),
    ];
    expect(automaticLinks(menu).get('MAIN-1')).toEqual(['DRINK-OK']);
  });

  it('gives a side only what its menu has: a dessert when there is no drink', () => {
    const menu = [
      dish({ itemCode: 'SIDE-1', role: 'SIDE', order: 0 }),
      dish({ itemCode: 'DESSERT-1', role: 'DESSERT', order: 1 }),
    ];
    expect(automaticLinks(menu).get('SIDE-1')).toEqual(['DESSERT-1']);
  });

  it('leaves a dish unlinked when its menu has nothing it could go with', () => {
    const menu = [dish({ itemCode: 'OTHER-1', role: 'OTHER', order: 0 }), dish({ itemCode: 'SIDE-1', role: 'SIDE', order: 1 })];
    expect(automaticLinks(menu).has('OTHER-1')).toBe(false);
  });

  it('is the same every time for the same menu', () => {
    const menu = [
      dish({ itemCode: 'MAIN-1', role: 'MAIN', order: 0 }),
      dish({ itemCode: 'DRINK-A', role: 'DRINK', order: 1 }),
      dish({ itemCode: 'DRINK-B', role: 'DRINK', order: 2 }),
    ];
    expect([...automaticLinks(menu)]).toEqual([...automaticLinks(menu)]);
  });

  it('caps the links a dish takes at the limit', () => {
    const menu = [
      dish({ itemCode: 'MAIN-1', role: 'MAIN', order: 0 }),
      dish({ itemCode: 'DRINK-A', role: 'DRINK', order: 1 }),
      dish({ itemCode: 'SIDE-1', role: 'SIDE', order: 2 }),
      dish({ itemCode: 'DESSERT-1', role: 'DESSERT', order: 3 }),
    ];
    expect(automaticLinks(menu, 1).get('MAIN-1')).toEqual(['DRINK-A']);
  });
});
