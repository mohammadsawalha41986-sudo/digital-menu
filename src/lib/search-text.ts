/**
 * Folds menu text for in-memory search, so a visitor finds a dish however
 * the name is spelled: with or without tashkeel or tatweel, any hamza form of
 * alef, ة or ه, ى or ي, Arabic-Indic or Latin digits, and any letter case.
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[ً-ٰٟۖ-ۭ]/g, '') // tashkeel and Quranic marks
    .replace(/ـ/g, '') // tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether any of the texts contains the query, both folded the same way. */
export function matchesSearch(query: string, texts: Array<string | null | undefined>): boolean {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  return texts.some((text) => Boolean(text) && normalizeSearchText(text!).includes(needle));
}
