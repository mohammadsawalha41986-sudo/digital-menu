import { describe, expect, it } from 'vitest';
import {
  caloriesWith,
  countOf,
  step,
  chosen,
  defaultSelection,
  missing,
  priceWith,
  selectionKey,
  stillValid,
  toggle,
  type ChoiceGroup,
} from '@/templates/street-food/sabah/choices';

const size: ChoiceGroup = {
  key: 'size',
  nameAr: 'الحجم',
  nameEn: 'Size',
  min: 1,
  max: 1,
  options: [
    { key: 'medium', nameAr: 'وسط', nameEn: 'Medium', price: 0, isDefault: true },
    { key: 'large', nameAr: 'كبير', nameEn: 'Large', price: 5, isDefault: false },
  ],
};
const rice: ChoiceGroup = {
  key: 'rice',
  nameAr: 'نوع الرز',
  nameEn: 'Rice',
  min: 1,
  max: 1,
  options: [
    { key: 'white', nameAr: 'أبيض', nameEn: 'White', price: 0, isDefault: false },
    { key: 'mandi', nameAr: 'مندي', nameEn: 'Mandi', price: 0, isDefault: false },
  ],
};
const extras: ChoiceGroup = {
  key: 'extras',
  nameAr: 'إضافات',
  nameEn: 'Extras',
  min: 0,
  max: 2,
  options: [
    { key: 'cheese', nameAr: 'جبنة', nameEn: 'Cheese', price: 2, isDefault: false },
    { key: 'garlic', nameAr: 'ثومية', nameEn: 'Garlic', price: 1.5, isDefault: false },
    { key: 'rice-swap', nameAr: 'رز بدل البطاطا', nameEn: 'Rice instead of fries', price: 1, isDefault: false },
  ],
};
const groups = [size, rice, extras];

describe('dish choices', () => {
  it('starts from the restaurant’s defaults and asks for what has none', () => {
    const selection = defaultSelection(groups);
    expect(selection).toEqual({ size: ['medium'], rice: [], extras: [] });
    expect(missing(groups, selection).map((group) => group.key)).toEqual(['rice']);
  });

  it('a single choice replaces; a required one cannot be cleared', () => {
    let selection = defaultSelection(groups);
    selection = toggle(selection, size, 'large');
    expect(selection.size).toEqual(['large']);
    selection = toggle(selection, size, 'large');
    expect(selection.size).toEqual(['large']);
  });

  it('extras add up to the maximum and no further', () => {
    let selection = defaultSelection(groups);
    selection = toggle(selection, extras, 'cheese');
    selection = toggle(selection, extras, 'garlic');
    selection = toggle(selection, extras, 'rice-swap');
    expect(selection.extras).toEqual(['cheese', 'garlic']);
    selection = toggle(selection, extras, 'cheese');
    expect(selection.extras).toEqual(['garlic']);
  });

  it('prices the dish with every chosen difference', () => {
    let selection = defaultSelection(groups);
    selection = toggle(selection, size, 'large');
    selection = toggle(selection, rice, 'mandi');
    selection = toggle(selection, extras, 'garlic');
    selection = toggle(selection, extras, 'rice-swap');
    const picks = chosen(groups, selection);
    expect(priceWith(20, picks)).toBe(27.5);
    expect(picks.map((group) => group.group)).toEqual(['size', 'rice', 'extras']);
  });

  it('keeps float dust out of three-decimal currencies', () => {
    const tiny: ChoiceGroup = { ...extras, options: [{ key: 'a', nameAr: 'أ', nameEn: 'A', price: 0.1, isDefault: false }] };
    expect(priceWith(0.2, chosen([tiny], { extras: ['a'] }))).toBe(0.3);
  });

  it('tells two orders of the same dish apart by their choices', () => {
    const a = chosen(groups, { size: ['large'], rice: ['white'], extras: [] });
    const b = chosen(groups, { size: ['large'], rice: ['mandi'], extras: [] });
    expect(selectionKey(a)).not.toBe(selectionKey(b));
    expect(selectionKey(a)).toBe(selectionKey(chosen(groups, { size: ['large'], rice: ['white'], extras: [] })));
  });

  it('drops a stored line whose choice was repriced, removed or newly required', () => {
    const picks = chosen(groups, { size: ['large'], rice: ['white'], extras: ['cheese'] });
    expect(stillValid(groups, picks)).toBe(true);

    const repriced = [{ ...size, options: [size.options[0]!, { ...size.options[1]!, price: 6 }] }, rice, extras];
    expect(stillValid(repriced, picks)).toBe(false);

    const removed = [size, rice, { ...extras, options: extras.options.slice(1) }];
    expect(stillValid(removed, picks)).toBe(false);

    const sauce: ChoiceGroup = { ...rice, key: 'sauce' };
    expect(stillValid([...groups, sauce], picks)).toBe(false);

    expect(stillValid([], undefined)).toBe(true);
  });
});

describe('quantities and calories', () => {
  const drinks: ChoiceGroup = {
    key: 'drinks',
    nameAr: 'المشروب',
    nameEn: 'Drink',
    min: 2,
    max: 2,
    options: [
      { key: 'pepsi', nameAr: 'بيبسي', nameEn: 'Pepsi', price: 0, calories: 150, maxQty: 2, isDefault: false },
      { key: 'water', nameAr: 'ماء', nameEn: 'Water', price: 0, calories: 0, maxQty: 2, isDefault: false },
      { key: 'juice', nameAr: 'عصير', nameEn: 'Juice', price: 3, calories: null, maxQty: 1, isDefault: false },
    ],
  };
  const riceSwap: ChoiceGroup = {
    key: 'rice',
    nameAr: 'الرز',
    nameEn: 'Rice',
    min: 1,
    max: 1,
    options: [
      { key: 'bukhari', nameAr: 'بخاري', nameEn: 'Bukhari', price: 0, calories: 0, isDefault: true },
      { key: 'none', nameAr: 'بدون رز', nameEn: 'No rice', price: -2, calories: -350, isDefault: false },
      { key: 'peshawar', nameAr: 'بشاور', nameEn: 'Peshawar', price: 3, calories: 40, isDefault: false },
    ],
  };

  it('two of the same drink count as two picks and satisfy "choose 2"', () => {
    let selection = step({}, drinks, 'pepsi', 1);
    expect(missing([drinks], selection)).toEqual([drinks]);
    selection = step(selection, drinks, 'pepsi', 1);
    expect(countOf(selection, 'drinks', 'pepsi')).toBe(2);
    expect(missing([drinks], selection)).toEqual([]);
    expect(chosen([drinks], selection)[0]?.options).toEqual([
      { key: 'pepsi', nameAr: 'بيبسي', nameEn: 'Pepsi', price: 0, qty: 2, calories: 150 },
    ]);
  });

  it('never goes past the group maximum or the option’s own limit', () => {
    let selection = step(step({}, drinks, 'pepsi', 1), drinks, 'water', 1);
    expect(step(selection, drinks, 'pepsi', 1)).toBe(selection); // group full
    selection = step({}, drinks, 'juice', 1);
    expect(step(selection, drinks, 'juice', 1)).toBe(selection); // juice once only
    expect(step(selection, drinks, 'juice', -1)).toEqual({ drinks: [] });
  });

  it('charges each extra by its quantity', () => {
    const extras: ChoiceGroup = { ...drinks, key: 'x', min: 0, max: 3, options: [{ ...drinks.options[0]!, price: 1.5, maxQty: 3 }] };
    const selection = step(step({}, extras, 'pepsi', 1), extras, 'pepsi', 1);
    expect(priceWith(20, chosen([extras], selection))).toBe(23);
  });

  it('a swap adds only its difference, so the replaced rice is not counted twice', () => {
    const base = 1100; // the dish with its bukhari rice
    expect(caloriesWith(base, chosen([riceSwap], { rice: ['bukhari'] }))).toEqual({ kcal: 1100, complete: true });
    expect(caloriesWith(base, chosen([riceSwap], { rice: ['none'] }))).toEqual({ kcal: 750, complete: true });
    expect(caloriesWith(base, chosen([riceSwap], { rice: ['peshawar'] }))).toEqual({ kcal: 1140, complete: true });
    expect(priceWith(25, chosen([riceSwap], { rice: ['none'] }))).toBe(23);
  });

  it('adds calories per quantity, and marks the total incomplete when a choice has none — never invents one', () => {
    const two = chosen([drinks], { drinks: ['pepsi', 'pepsi'] });
    expect(caloriesWith(1100, two)).toEqual({ kcal: 1400, complete: true });
    const withJuice = chosen([drinks], { drinks: ['pepsi', 'juice'] });
    expect(caloriesWith(1100, withJuice)).toEqual({ kcal: 1250, complete: false });
    expect(caloriesWith(null, two)).toEqual({ kcal: null, complete: false });
  });

  it('a stored line with more of an option than allowed, or a changed price, is dropped', () => {
    const picks = chosen([drinks], { drinks: ['pepsi', 'pepsi'] });
    expect(stillValid([drinks], picks)).toBe(true);
    expect(stillValid([{ ...drinks, options: drinks.options.map((option) => ({ ...option, maxQty: 1 })) }], picks)).toBe(false);
    expect(stillValid([{ ...drinks, max: 1, min: 1 }], picks)).toBe(false);
    // A line saved before quantities existed still reads as one each.
    expect(stillValid([riceSwap], [{ group: 'rice', nameAr: '', nameEn: '', options: [{ key: 'none', nameAr: '', nameEn: '', price: -2 }] }])).toBe(true);
  });

  it('two Pepsis and one Pepsi are different cart lines', () => {
    expect(selectionKey(chosen([drinks], { drinks: ['pepsi', 'pepsi'] }))).not.toBe(
      selectionKey(chosen([drinks], { drinks: ['pepsi', 'water'] })),
    );
    expect(selectionKey(chosen([drinks], { drinks: ['pepsi', 'pepsi'] }))).toBe('drinks:pepsix2');
  });
});
