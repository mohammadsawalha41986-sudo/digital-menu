import type { MenuItem } from '../data/menuData';

/**
 * The tabs of "complete your meal": drinks, sides, desserts, and what the
 * restaurant's customers order most. The groups come from each dish's own
 * section role and its featured flag, so the arrangement follows the dishes.
 */
export type SuggestionGroupKey = 'drink' | 'side' | 'dessert' | 'popular';

/** Display order of the tabs. */
export const SUGGESTION_GROUP_ORDER: readonly SuggestionGroupKey[] = ['drink', 'side', 'dessert', 'popular'];

export const SUGGESTION_GROUP_LABEL: Record<SuggestionGroupKey, { ar: string; en: string }> = {
  drink: { ar: 'مشروب', en: 'Drinks' },
  side: { ar: 'طبق جانبي', en: 'Sides' },
  dessert: { ar: 'حلى', en: 'Desserts' },
  popular: { ar: 'رائج', en: 'Popular' },
};

export interface SuggestionGroup {
  key: SuggestionGroupKey;
  dishes: MenuItem[];
}

/** Roles that have a tab of their own; any other dish is a main dish. */
const TYPED_ROLES = new Set(['DRINK', 'SIDE', 'DESSERT']);

function belongsTo(dish: MenuItem, key: SuggestionGroupKey): boolean {
  if (key === 'drink') return dish.role === 'DRINK';
  if (key === 'side') return dish.role === 'SIDE';
  if (key === 'dessert') return dish.role === 'DESSERT';
  // Popular is the featured dishes, plus every main dish: a dish the
  // restaurant paired by hand must never vanish from the suggestions.
  return Boolean(dish.isPopular) || !TYPED_ROLES.has(dish.role ?? '');
}

/** The non-empty tabs, in display order. A dish can sit under more than one tab. */
export function suggestionGroups(dishes: MenuItem[]): SuggestionGroup[] {
  return SUGGESTION_GROUP_ORDER.flatMap((key) => {
    const members = dishes.filter((dish) => belongsTo(dish, key));
    return members.length > 0 ? [{ key, dishes: members }] : [];
  });
}

/** The tab that opens first: popular when there is one, otherwise the first tab. */
export function defaultSuggestionGroup(groups: SuggestionGroup[]): SuggestionGroupKey | undefined {
  return groups.find((group) => group.key === 'popular')?.key ?? groups[0]?.key;
}
