import { describe, expect, it } from 'vitest';
import {
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
