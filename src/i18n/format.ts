import { bcp47Of, type Locale } from './config';

/**
 * Locale-aware formatting.
 *
 * Deliberate choice: Arabic uses Western Arabic numerals (`latn`) rather than
 * Eastern Arabic-Indic digits. Saudi and Gulf menus overwhelmingly print
 * prices as `42 ر.س`, and a price is the one value on the page that must never
 * cost the visitor a second look (master spec §32).
 */

const NUMBERING_SYSTEM = 'latn';

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(`${bcp47Of(locale)}-u-nu-${NUMBERING_SYSTEM}`).format(value);
}

/**
 * Formats a price. Amounts are stored as integer minor units to keep money out
 * of binary floating point.
 */
export function formatPrice(
  amountMinorUnits: number,
  currency: string,
  locale: Locale,
  minorUnitDigits = 2,
): string {
  const amount = amountMinorUnits / 10 ** minorUnitDigits;

  return new Intl.NumberFormat(`${bcp47Of(locale)}-u-nu-${NUMBERING_SYSTEM}`, {
    style: 'currency',
    currency,
    // Menus read better without trailing zeros on whole amounts.
    minimumFractionDigits: Number.isInteger(amount) ? 0 : minorUnitDigits,
    maximumFractionDigits: minorUnitDigits,
  }).format(amount);
}

export function formatCalories(kcal: number, locale: Locale): string {
  const value = formatNumber(kcal, locale);
  return locale === 'ar' ? `${value} سعرة` : `${value} kcal`;
}

export function formatDate(date: Date, locale: Locale, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat(`${bcp47Of(locale)}-u-nu-${NUMBERING_SYSTEM}`, {
    dateStyle: 'medium',
    timeZone,
  }).format(date);
}

/**
 * Renders a stored `HH:MM` as a clock time in the visitor's locale — so an
 * English reader gets "5:00 PM" and an Arabic reader gets the form their
 * locale uses, from one stored value.
 *
 * The date carrying the time is arbitrary and never shown; only the
 * hour and minute are formatted.
 */
export function formatClock(time: string, locale: Locale): string {
  const [hours, minutes] = time.split(':').map(Number);

  if (
    hours === undefined ||
    minutes === undefined ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return time;
  }

  const carrier = new Date(Date.UTC(2000, 0, 1, hours, minutes));

  return new Intl.DateTimeFormat(`${bcp47Of(locale)}-u-nu-${NUMBERING_SYSTEM}`, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(carrier);
}
