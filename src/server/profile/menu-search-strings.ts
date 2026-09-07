import type { Locale } from '@/i18n/config';
import type { MenuSearchStrings } from './menu-search';

/**
 * Copy for the menu search, resolved on the server.
 *
 * Kept apart from the component so the strings are chosen where the locale is
 * already known, and the client bundle carries one language rather than every
 * language it might have needed.
 */
const COPY: Record<'ar' | 'en', MenuSearchStrings> = {
  ar: {
    label: 'ابحث في القائمة',
    placeholder: 'ابحث عن طبق…',
    clear: 'مسح',
    none: 'لا توجد نتائج',
    one: 'نتيجة واحدة',
    manySuffix: 'نتائج',
  },
  en: {
    label: 'Search the menu',
    placeholder: 'Search for a dish…',
    clear: 'Clear',
    none: 'Nothing matched',
    one: '1 result',
    manySuffix: 'results',
  },
};

export function menuSearchStrings(locale: Locale): MenuSearchStrings {
  return COPY[locale === 'ar' ? 'ar' : 'en'];
}
