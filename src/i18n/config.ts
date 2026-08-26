/**
 * Locale architecture (master spec §07, §08, §98, §99; GOALS I3, I4).
 *
 * Arabic is the primary authored language and the default rendering locale.
 * English is a peer locale with its own authored content — never a machine
 * translation presented as authored copy.
 *
 * Locale is *not* part of the public path. The permanent QR resolves to
 * `/m/{publicId}`; that URL must stay byte-identical for the life of the
 * printed code (GOALS I1/I2). Language is therefore expressed as an optional
 * `?lang=` parameter plus a cookie, which also makes "switching language
 * preserves the current page" (§08) fall out for free — the switcher only
 * rewrites one search parameter.
 */

export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Arabic first, everywhere. */
export const DEFAULT_LOCALE: Locale = 'ar';

export const LOCALE_QUERY_PARAM = 'lang';
export const LOCALE_COOKIE = 'dpos_locale';

export type Direction = 'rtl' | 'ltr';

const DIRECTIONS: Record<Locale, Direction> = { ar: 'rtl', en: 'ltr' };

/** BCP-47 tags used for Intl formatting and `hreflang`. */
const BCP47: Record<Locale, string> = { ar: 'ar', en: 'en' };

/** Endonyms for the language switcher — each language names itself. */
export const LOCALE_LABELS: Record<Locale, string> = { ar: 'العربية', en: 'English' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function directionOf(locale: Locale): Direction {
  return DIRECTIONS[locale];
}

export function bcp47Of(locale: Locale): string {
  return BCP47[locale];
}

export interface LocaleResolutionInput {
  /** `?lang=` on the current request — an explicit, deliberate choice. */
  queryParam?: string | string[] | null;
  /** Previously chosen locale, persisted per visitor. */
  cookie?: string | null;
  /** Raw `Accept-Language` header. */
  acceptLanguage?: string | null;
  /** The business's own default; overrides the platform default. */
  businessDefault?: string | null;
}

/**
 * Resolution order, most explicit first:
 *   1. `?lang=` — the visitor just clicked the switcher.
 *   2. cookie — the visitor chose earlier.
 *   3. `Accept-Language` — the visitor's device preference.
 *   4. the business's default locale.
 *   5. the platform default (Arabic).
 *
 * Unknown values are ignored rather than erroring: a malformed `?lang=` should
 * never produce an error page for a visitor who just scanned a QR code.
 */
export function resolveLocale(input: LocaleResolutionInput = {}): Locale {
  const fromQuery = Array.isArray(input.queryParam) ? input.queryParam[0] : input.queryParam;
  if (isLocale(fromQuery)) return fromQuery;

  if (isLocale(input.cookie)) return input.cookie;

  const fromHeader = parseAcceptLanguage(input.acceptLanguage);
  if (fromHeader) return fromHeader;

  if (isLocale(input.businessDefault)) return input.businessDefault;

  return DEFAULT_LOCALE;
}

/** Picks the highest-weighted supported locale from an `Accept-Language` header. */
export function parseAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;

  const candidates = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params.find((param) => param.trim().startsWith('q='));
      const quality = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((candidate) => candidate.tag.length > 0 && candidate.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const candidate of candidates) {
    // Match the primary subtag so `en-GB` and `ar-SA` both resolve.
    const primary = candidate.tag.split('-')[0];
    if (isLocale(primary)) return primary;
  }

  return null;
}

/**
 * Builds the href for the language switcher: the same path with one parameter
 * changed, so business, branch, menu, category and scroll context survive
 * (master spec §08).
 */
export function localeHref(pathname: string, searchParams: URLSearchParams, locale: Locale): string {
  const next = new URLSearchParams(searchParams);
  next.set(LOCALE_QUERY_PARAM, locale);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
