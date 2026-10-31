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
  isDefault: boolean;
}

export interface ChoiceGroup {
  key: string;
  nameAr: string;
  nameEn: string;
  min: number;
  max: number;
  options: ChoiceOption[];
}

/** Chosen option keys, by group key. */
export type Selection = Record<string, string[]>;

/** What a cart line keeps of the choices: names and prices as chosen. */
export interface ChosenGroup {
  group: string;
  nameAr: string;
  nameEn: string;
  options: { key: string; nameAr: string; nameEn: string; price: number }[];
}

export const isSingle = (group: ChoiceGroup) => group.max === 1;

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
        .map(({ key, nameAr, nameEn, price }) => ({ key, nameAr, nameEn, price })),
    }))
    .filter((group) => group.options.length > 0);
}

/** The dish price with every chosen difference added. */
export function priceWith(base: number, picks: ChosenGroup[]): number {
  const total = picks.reduce(
    (sum, group) => sum + group.options.reduce((inner, option) => inner + option.price, 0),
    base,
  );
  // Amounts are decimals of the currency; keep the sum free of float dust.
  return Math.round(total * 1000) / 1000;
}

/** Two lines with the same dish and this key are the same order. */
export function selectionKey(picks: ChosenGroup[] | undefined): string {
  return (picks ?? [])
    .map((group) => `${group.group}:${group.options.map((option) => option.key).join('+')}`)
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
    if (!group || pick.options.length > group.max) return false;
    for (const option of pick.options) {
      const current = group.options.find((candidate) => candidate.key === option.key);
      if (!current || current.price !== option.price) return false;
    }
  }
  return groups.every(
    (group) => (lines.find((pick) => pick.group === group.key)?.options.length ?? 0) >= group.min,
  );
}
