import { DEFAULT_LOCALE, type Locale } from './config';

/**
 * Bilingual *business content* resolution (master spec §08, §72; GOALS I3, I9).
 *
 * The rule this encodes: the platform never invents a translation. When a
 * business has authored Arabic but not English, an English visitor sees the
 * authored Arabic — correctly marked with its own `lang` and `dir` so screen
 * readers and the browser treat it as Arabic text — rather than a machine
 * translation, an empty string, or a raw translation key.
 *
 * Callers receive the source locale alongside the value so templates can set
 * those attributes and, where a design calls for it, disclose the fallback.
 */

export interface LocalizedField {
  ar?: string | null;
  en?: string | null;
}

export interface ResolvedContent {
  value: string;
  /** Locale the returned text was actually authored in. */
  sourceLocale: Locale;
  /** True when the requested locale had no authored content. */
  isFallback: boolean;
}

/**
 * Resolves a bilingual field for display. Returns `null` when neither locale
 * has content, so callers hide the element instead of rendering an empty
 * heading or a broken card (master spec §120).
 */
export function resolveContent(field: LocalizedField, locale: Locale): ResolvedContent | null {
  const requested = field[locale];
  if (isPresent(requested)) {
    return { value: requested.trim(), sourceLocale: locale, isFallback: false };
  }

  const fallbackOrder: Locale[] = locale === DEFAULT_LOCALE ? ['en'] : [DEFAULT_LOCALE];

  for (const candidate of fallbackOrder) {
    const value = field[candidate];
    if (isPresent(value)) {
      return { value: value.trim(), sourceLocale: candidate, isFallback: true };
    }
  }

  return null;
}

/** Convenience for call sites that can tolerate an empty string. */
export function resolveContentOrEmpty(field: LocalizedField, locale: Locale): string {
  return resolveContent(field, locale)?.value ?? '';
}

function isPresent(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
