/**
 * Section keys.
 *
 * A section's key is its permanent internal name: dishes point at it
 * (`categoryKey`), the spreadsheet matches on it, and the menu uses it as the
 * section's anchor. It is unique within its menu and always matches
 * `^[a-z0-9][a-z0-9-]{0,62}$` (the form every validator checks).
 *
 * Owners never type one. It is made from the English name when there is one
 * ("Grilled Chicken" → `grilled-chicken`), otherwise from a short hash of the
 * Arabic name, so the same name always gives the same key.
 */

const KEY = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidKey(value: string): boolean {
  return KEY.test(value);
}

/** FNV-1a, base 36, lower case: short, stable, and valid in a key. */
export function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/** The key a section with these names would get, before checking it is free. */
export function sectionKeyFor(nameAr: string, nameEn?: string | null): string {
  const latin = (nameEn ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  if (latin && isValidKey(latin)) return latin;

  // Arabic (or any non-Latin) name: hash the name as written, trimmed and
  // with runs of spaces folded, so "دجاج  الشواية" and "دجاج الشواية" agree.
  const arabic = nameAr.trim().replace(/\s+/g, ' ');
  return `s-${stableHash(arabic || 'section')}`;
}

/** `base`, or `base-2`, `base-3`… — the first one not already taken. */
export function uniqueKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  const stem = base.slice(0, 58);
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
