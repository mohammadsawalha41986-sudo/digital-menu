import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  directionOf,
  localeHref,
  parseAcceptLanguage,
  resolveLocale,
} from '@/i18n/config';
import { resolveContent } from '@/i18n/content';
import { formatCalories, formatClock, formatPrice } from '@/i18n/format';
import { getDictionary } from '@/i18n/dictionary';

describe('locale resolution', () => {
  it('defaults to Arabic', () => {
    expect(DEFAULT_LOCALE).toBe('ar');
    expect(resolveLocale()).toBe('ar');
  });

  it('maps direction natively per locale', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });

  it('prefers an explicit ?lang= over every weaker signal', () => {
    expect(
      resolveLocale({
        queryParam: 'en',
        cookie: 'ar',
        acceptLanguage: 'ar-SA',
        businessDefault: 'ar',
      }),
    ).toBe('en');
  });

  it('falls back through cookie, header, then the business default', () => {
    expect(resolveLocale({ cookie: 'en', acceptLanguage: 'ar' })).toBe('en');
    expect(resolveLocale({ acceptLanguage: 'en-GB,en;q=0.9' })).toBe('en');
    expect(resolveLocale({ businessDefault: 'en' })).toBe('en');
  });

  it('ignores malformed input rather than erroring for a visitor', () => {
    expect(resolveLocale({ queryParam: 'fr' })).toBe('ar');
    expect(resolveLocale({ queryParam: '<script>' })).toBe('ar');
    expect(resolveLocale({ cookie: 'nonsense', acceptLanguage: 'en' })).toBe('en');
  });

  it('honours Accept-Language quality weighting', () => {
    expect(parseAcceptLanguage('en;q=0.2,ar;q=0.9')).toBe('ar');
    expect(parseAcceptLanguage('fr-FR,de;q=0.8')).toBeNull();
    expect(parseAcceptLanguage(null)).toBeNull();
  });

  it('preserves the current URL when switching language (master spec §08)', () => {
    const href = localeHref('/m/DEM001', new URLSearchParams('menu=main&lang=ar'), 'en');
    expect(href).toBe('/m/DEM001?menu=main&lang=en');
  });
});

describe('bilingual business content', () => {
  it('returns authored content for the requested locale', () => {
    const result = resolveContent({ ar: 'برجر دجاج', en: 'Chicken Burger' }, 'en');
    expect(result).toEqual({ value: 'Chicken Burger', sourceLocale: 'en', isFallback: false });
  });

  it('never fabricates a translation — it falls back and says so', () => {
    const result = resolveContent({ ar: 'مقهى النموذج', en: null }, 'en');
    expect(result).toEqual({ value: 'مقهى النموذج', sourceLocale: 'ar', isFallback: true });
  });

  it('treats whitespace-only content as absent', () => {
    expect(resolveContent({ ar: 'اسم', en: '   ' }, 'en')?.sourceLocale).toBe('ar');
  });

  it('returns null when nothing is authored, so the caller hides the element', () => {
    expect(resolveContent({ ar: null, en: undefined }, 'ar')).toBeNull();
  });
});

describe('locale-aware formatting', () => {
  it('formats prices in both locales using Western Arabic numerals', () => {
    expect(formatPrice(4200, 'SAR', 'en')).toMatch(/42/);
    const arabic = formatPrice(4200, 'SAR', 'ar');
    expect(arabic).toMatch(/42/);
    // Eastern Arabic-Indic digits would defeat at-a-glance price reading.
    expect(arabic).not.toMatch(/[٠-٩]/);
  });

  it('labels calories per locale', () => {
    expect(formatCalories(680, 'en')).toBe('680 kcal');
    expect(formatCalories(680, 'ar')).toBe('680 سعرة');
  });
});

describe('interface dictionaries', () => {
  it('exposes the same keys in both languages so no key can leak to a visitor', () => {
    const ar = getDictionary('ar');
    const en = getDictionary('en');
    const flatten = (value: object, prefix = ''): string[] =>
      Object.entries(value).flatMap(([key, entry]) =>
        typeof entry === 'object' && entry !== null
          ? flatten(entry, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      );

    expect(flatten(en).sort()).toEqual(flatten(ar).sort());
  });

  it('has no empty strings', () => {
    const values = JSON.stringify(getDictionary('ar')) + JSON.stringify(getDictionary('en'));
    expect(values).not.toContain('""');
  });
});

describe('clock formatting', () => {
  it('renders a stored 24-hour time in the English locale', () => {
    expect(formatClock('17:00', 'en')).toMatch(/5:00/);
  });

  it('uses the same Western numerals Arabic prices use', () => {
    // The house rule (see format.ts): Arabic menus print `42 ر.س`, not ٤٢.
    expect(formatClock('09:30', 'ar')).toMatch(/9|09/);
    expect(formatClock('09:30', 'ar')).not.toMatch(/[٠-٩]/);
  });

  it('returns malformed input unchanged rather than inventing a time', () => {
    expect(formatClock('not-a-time', 'en')).toBe('not-a-time');
  });
});
