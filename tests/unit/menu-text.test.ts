import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTION, parseMenuText, readPrice } from '@/lib/menu-text';

const EXAMPLE = [
  'دجاج الشواية',
  'نصف دجاج شواية مع الأرز | 23 | نصف دجاج شواية مع أرز',
  'حبة دجاج شواية مع الأرز | 44 | حبة دجاج شواية مع أرز',
  'الأرز',
  'أرز بخاري | 8',
  'أرز برياني | 8',
].join('\n');

describe('pasted menu text', () => {
  it('reads the owner’s example: headings, dishes, prices, optional descriptions', () => {
    const parsed = parseMenuText(EXAMPLE);
    expect(parsed.problems).toEqual([]);
    expect(parsed.sections).toEqual([
      {
        name: 'دجاج الشواية',
        dishes: [
          { line: 2, name: 'نصف دجاج شواية مع الأرز', price: '23', description: 'نصف دجاج شواية مع أرز' },
          { line: 3, name: 'حبة دجاج شواية مع الأرز', price: '44', description: 'حبة دجاج شواية مع أرز' },
        ],
      },
      {
        name: 'الأرز',
        dishes: [
          { line: 5, name: 'أرز بخاري', price: '8', description: null },
          { line: 6, name: 'أرز برياني', price: '8', description: null },
        ],
      },
    ]);
  });

  it('keeps a description that contains a number as the description', () => {
    const parsed = parseMenuText('Grills\nMixed grill | 85 | With 3 sauces and 2 breads');
    expect(parsed.sections[0]?.dishes[0]).toMatchObject({ name: 'Mixed grill', price: '85', description: 'With 3 sauces and 2 breads' });
  });

  it('reads the one-line form Section | Dish | Price | Description', () => {
    const parsed = parseMenuText('Starters | Hummus | 18 | With olive oil');
    expect(parsed.sections).toEqual([
      { name: 'Starters', dishes: [{ line: 1, name: 'Hummus', price: '18', description: 'With olive oil' }] },
    ]);
  });

  it('reads Arabic digits, decimals and a currency after the number', () => {
    expect(readPrice('٢٣')).toBe('23');
    expect(readPrice('8,50')).toBe('8.50');
    expect(readPrice('8٫5')).toBe('8.5');
    expect(readPrice('23 ر.س')).toBe('23');
    expect(readPrice('SAR 12')).toBe('12');
    expect(readPrice('twelve')).toBeNull();
    expect(readPrice('')).toBeNull();
  });

  it('reports a line without a price by its number and keeps every other line', () => {
    const parsed = parseMenuText('الأرز\nأرز بخاري | 8\nأرز مندي |\nأرز كابلي | غالي');
    expect(parsed.sections[0]?.dishes.map((dish) => dish.name)).toEqual(['أرز بخاري']);
    expect(parsed.problems.map((problem) => [problem.line, problem.problem])).toEqual([
      [3, expect.stringMatching(/No price/)],
      [4, expect.stringMatching(/“غالي” is not a price/)],
    ]);
  });

  it('puts dishes before any heading in a default section, and merges a repeated heading', () => {
    const parsed = parseMenuText('شاي | 3\nمشروبات\nقهوة | 5\nمشروبات\nعصير | 7');
    expect(parsed.sections.map((section) => [section.name, section.dishes.length])).toEqual([
      [DEFAULT_SECTION, 1],
      ['مشروبات', 2],
    ]);
  });
});
