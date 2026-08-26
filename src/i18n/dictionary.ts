import ar from './dictionaries/ar.json';
import en from './dictionaries/en.json';
import { DEFAULT_LOCALE, type Locale } from './config';

/**
 * UI strings. These are *interface* strings authored by the team, distinct
 * from *business content* (item names, descriptions) which lives in the
 * database with explicit per-locale columns — see `content.ts`.
 *
 * Arabic is the source dictionary; English is authored alongside it. Both are
 * typed against the Arabic shape so a missing English key is a build error
 * rather than a translation key leaking to a visitor (master spec §08).
 */

export type Dictionary = typeof ar;

const DICTIONARIES: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}
