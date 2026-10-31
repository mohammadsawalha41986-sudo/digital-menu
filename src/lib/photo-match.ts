/**
 * Matching a pile of photo files to dishes by file name.
 *
 * Owners name photos the way they think of the dish — "كرواسون زبدة.jpg",
 * "Butter croissant.jpeg" — or by the dish code from the spreadsheet
 * ("BK-010.jpg"). A match is only proposed when it is unambiguous; anything
 * else is left for the owner to pick, never guessed.
 */

export interface PhotoTarget {
  code: string;
  names: string[];
}

/** Lower case, no extension, Arabic letter variants and marks folded. */
export function normaliseName(value: string): string {
  return value
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // harakat, dagger alef, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[_\-.()[\]{}+،,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The dish a file is for, or null. In order: the dish code anywhere in the
 * name, the exact dish name, then a name that contains (or is contained by)
 * exactly one dish's name.
 */
export function matchPhoto(fileName: string, targets: PhotoTarget[]): string | null {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, '').toUpperCase();
  const byCode = targets.filter((target) =>
    new RegExp(`(^|[^A-Z0-9])${escape(target.code.toUpperCase())}($|[^A-Z0-9])`).test(base),
  );
  if (byCode.length === 1) return byCode[0]!.code;

  const name = normaliseName(fileName);
  if (!name) return null;

  const exact = targets.filter((target) => target.names.some((entry) => normaliseName(entry) === name));
  if (exact.length === 1) return exact[0]!.code;
  if (exact.length > 1) return null;

  const partial = targets.filter((target) =>
    target.names.some((entry) => {
      const dish = normaliseName(entry);
      return dish.length >= 3 && name.length >= 3 && (name.includes(dish) || dish.includes(name));
    }),
  );
  return partial.length === 1 ? partial[0]!.code : null;
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
