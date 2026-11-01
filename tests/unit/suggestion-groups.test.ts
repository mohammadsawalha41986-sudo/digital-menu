import { describe, expect, it } from 'vitest';
import {
  defaultSuggestionGroup,
  needsChoice,
  suggestionGroups,
} from '@/templates/street-food/sabah/components/suggestion-groups';
import type { MenuItem } from '@/templates/street-food/sabah/data/menuData';

const dish = (id: string, role?: MenuItem['role'], isPopular = false): MenuItem => ({
  id,
  nameAr: id,
  nameEn: id,
  categoryId: 'section',
  price: 10,
  role,
  isPopular,
});

const ids = (dishes: MenuItem[]) => dishes.map((item) => item.id);

describe('suggestion tabs', () => {
  it('groups drinks, sides and desserts by the role of their section, in that order', () => {
    const groups = suggestionGroups([dish('e', 'DESSERT'), dish('s', 'SIDE'), dish('d', 'DRINK')]);
    expect(groups.map((group) => group.key)).toEqual(['drink', 'side', 'dessert']);
    expect(groups.map((group) => ids(group.dishes))).toEqual([['d'], ['s'], ['e']]);
  });

  it('puts a featured dish in the popular tab, whatever its role', () => {
    const groups = suggestionGroups([dish('m', 'MAIN', true), dish('d', 'DRINK')]);
    const popular = groups.find((group) => group.key === 'popular');
    expect(popular && ids(popular.dishes)).toEqual(['m']);
  });

  it('never drops a main dish the restaurant paired by hand: it lands in the popular tab', () => {
    const groups = suggestionGroups([dish('m', 'MAIN')]);
    expect(groups.map((group) => group.key)).toEqual(['popular']);
    expect(groups.map((group) => ids(group.dishes))).toEqual([['m']]);
  });

  it('a featured drink sits under both the drink tab and the popular tab', () => {
    const groups = suggestionGroups([dish('d', 'DRINK', true)]);
    expect(groups.map((group) => group.key)).toEqual(['drink', 'popular']);
  });

  it('treats a dish with no section role as popular rather than dropping it', () => {
    const groups = suggestionGroups([dish('x')]);
    expect(groups.map((group) => group.key)).toEqual(['popular']);
  });

  it('opens on popular when that tab exists, otherwise on the first tab', () => {
    expect(defaultSuggestionGroup(suggestionGroups([dish('d', 'DRINK'), dish('m', 'MAIN', true)]))).toBe('popular');
    expect(defaultSuggestionGroup(suggestionGroups([dish('d', 'DRINK'), dish('s', 'SIDE')]))).toBe('drink');
    expect(defaultSuggestionGroup([])).toBeUndefined();
  });

  it('shows a single tab when every suggestion is of one kind, so no tab bar is needed', () => {
    expect(suggestionGroups([dish('a', 'SIDE'), dish('b', 'SIDE')]).map((group) => group.key)).toEqual(['side']);
  });
});

describe('needsChoice', () => {
  const choice = (min: number): NonNullable<MenuItem['choices']>[number] => ({
    key: 'g',
    nameAr: 'g',
    nameEn: 'g',
    min,
    max: 1,
    options: [],
  });

  it('is true when a group must have at least one pick', () => {
    expect(needsChoice({ ...dish('x'), choices: [choice(1)] })).toBe(true);
  });

  it('is false for a dish with no choices, or only optional ones', () => {
    expect(needsChoice(dish('x'))).toBe(false);
    expect(needsChoice({ ...dish('x'), choices: [choice(0)] })).toBe(false);
  });
});
