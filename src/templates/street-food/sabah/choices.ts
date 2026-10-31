/**
 * The choices a customer makes on a dish: a size, a rice type, extras, a
 * swap. Each group comes from the restaurant with its bounds — `min > 0` is
 * required, `max` 1 is a single choice — and each option carries the price
 * difference it makes, in the menu's currency.
 */

export interface ChoiceOption {
  key: string;
  nameAr: string;
  nameEn: string;
  /** Added to the dish price; may be zero or negative (a smaller size). */
  price: number;
  /** Calorie difference; null or absent when the restaurant has not given it. */
  calories?: number | null;
  /** How many of this one option a dish may carry (two Pepsis); default 1. */
  maxQty?: number;
  isDefault: boolean;
}

export interface ChoiceGroup {
  key: string;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  min: number;
  max: number;
  options: ChoiceOption[];
}

/**
 * Chosen option keys, by group key. A key repeated is that option taken
 * more than once: ['pepsi', 'pepsi'] is two Pepsis, and both count toward
 * the group's maximum.
 */
export type Selection = Record<string, string[]>;

/** What a cart line keeps of the choices: names and prices as chosen. */
export interface ChosenGroup {
  group: string;
  nameAr: string;
  nameEn: string;
  /** `qty` absent on lines saved before quantities existed: one. */
  options: { key: string; nameAr: string; nameEn: string; price: number; qty?: number; calories?: number | null }[];
}

export const isSingle = (group: ChoiceGroup) => group.max === 1;

const maxQtyOf = (option: ChoiceOption) => Math.max(1, option.maxQty ?? 1);

/** How many of one option are chosen. */
export function countOf(selection: Selection, groupKey: string, optionKey: string): number {
  return (selection[groupKey] ?? []).filter((key) => key === optionKey).length;
}

/** How many picks a group holds, repeats included. */
export const picksIn = (selection: Selection, group: ChoiceGroup) => (selection[group.key] ?? []).length;

/**
 * One more or one fewer of an option that may be taken several times. Adding
 * past the option's own limit or the group's maximum does nothing.
 */
export function step(selection: Selection, group: ChoiceGroup, optionKey: string, delta: 1 | -1): Selection {
  const option = group.options.find((candidate) => candidate.key === optionKey);
  if (!option) return selection;
  const current = selection[group.key] ?? [];
  if (delta > 0) {
    if (current.length >= group.max || countOf(selection, group.key, optionKey) >= maxQtyOf(option)) return selection;
    return { ...selection, [group.key]: [...current, optionKey] };
  }
  const at = current.lastIndexOf(optionKey);
  if (at < 0) return selection;
  return { ...selection, [group.key]: [...current.slice(0, at), ...current.slice(at + 1)] };
}

/** The restaurant's defaults, kept within each group's maximum. */
export function defaultSelection(groups: ChoiceGroup[]): Selection {
  return Object.fromEntries(
    groups.map((group) => [
      group.key,
      group.options
        .filter((option) => option.isDefault)
        .slice(0, group.max)
        .map((option) => option.key),
    ]),
  );
}

/**
 * A tap on an option. A single choice replaces (and an optional one can be
 * tapped again to clear); a multiple choice adds or removes, and ignores a
 * tap past the maximum rather than dropping an earlier pick.
 */
export function toggle(selection: Selection, group: ChoiceGroup, optionKey: string): Selection {
  const current = selection[group.key] ?? [];
  const chosen = current.includes(optionKey);
  let next: string[];

  if (isSingle(group)) {
    next = chosen ? (group.min > 0 ? current : []) : [optionKey];
  } else if (chosen) {
    // Every one of this option goes, including repeats.
    next = current.filter((key) => key !== optionKey);
  } else {
    next = current.length >= group.max ? current : [...current, optionKey];
  }

  return { ...selection, [group.key]: next };
}

/** Groups that still need a choice before the dish can be ordered. */
export function missing(groups: ChoiceGroup[], selection: Selection): ChoiceGroup[] {
  return groups.filter((group) => (selection[group.key]?.length ?? 0) < group.min);
}

/** The chosen options in the restaurant's order, ready for a cart line. */
export function chosen(groups: ChoiceGroup[], selection: Selection): ChosenGroup[] {
  return groups
    .map((group) => ({
      group: group.key,
      nameAr: group.nameAr,
      nameEn: group.nameEn,
      options: group.options
        .filter((option) => selection[group.key]?.includes(option.key))
        .map(({ key, nameAr, nameEn, price, calories }) => ({
          key,
          nameAr,
          nameEn,
          price,
          qty: countOf(selection, group.key, key),
          calories: calories ?? null,
        })),
    }))
    .filter((group) => group.options.length > 0);
}

/** The dish price with every chosen difference added. */
export function priceWith(base: number, picks: ChosenGroup[]): number {
  const total = picks.reduce(
    (sum, group) => sum + group.options.reduce((inner, option) => inner + option.price * (option.qty ?? 1), 0),
    base,
  );
  // Amounts are decimals of the currency; keep the sum free of float dust.
  return Math.round(total * 1000) / 1000;
}

/** Two lines with the same dish and this key are the same order. */
export function selectionKey(picks: ChosenGroup[] | undefined): string {
  return (picks ?? [])
    .map(
      (group) =>
        `${group.group}:${group.options
          .map((option) => ((option.qty ?? 1) > 1 ? `${option.key}x${option.qty}` : option.key))
          .join('+')}`,
    )
    .join('|');
}

/**
 * Whether a stored line still matches the dish as the restaurant serves it
 * now: every chosen option still offered at the same price, within bounds,
 * and every required group answered. A line that fails is dropped rather
 * than sent to the restaurant at a price or with a choice it no longer has.
 */
export function stillValid(groups: ChoiceGroup[], picks: ChosenGroup[] | undefined): boolean {
  const lines = picks ?? [];
  for (const pick of lines) {
    const group = groups.find((candidate) => candidate.key === pick.group);
    if (!group) return false;
    let count = 0;
    for (const option of pick.options) {
      const current = group.options.find((candidate) => candidate.key === option.key);
      const qty = option.qty ?? 1;
      if (!current || current.price !== option.price || qty < 1 || qty > maxQtyOf(current)) return false;
      count += qty;
    }
    if (count > group.max) return false;
  }
  return groups.every((group) => {
    const pick = lines.find((candidate) => candidate.group === group.key);
    return (pick?.options.reduce((sum, option) => sum + (option.qty ?? 1), 0) ?? 0) >= group.min;
  });
}

/**
 * Calories of the dish as chosen: the dish's own figure plus each chosen
 * option's difference, times how many were taken. A swap's difference is
 * already net of what it replaces, so nothing is counted twice. `complete`
 * is false when the dish or a chosen option has no figure: the total is then
 * a lower bound and is shown as such, never as an exact number.
 */
export function caloriesWith(
  base: number | null | undefined,
  picks: ChosenGroup[],
): { kcal: number | null; complete: boolean } {
  if (base === null || base === undefined) return { kcal: null, complete: false };
  let kcal = base;
  let complete = true;
  for (const group of picks) {
    for (const option of group.options) {
      if (option.calories === null || option.calories === undefined) {
        complete = false;
        continue;
      }
      kcal += option.calories * (option.qty ?? 1);
    }
  }
  return { kcal: Math.max(0, Math.round(kcal)), complete };
}
