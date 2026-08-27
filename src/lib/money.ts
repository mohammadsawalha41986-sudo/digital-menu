import { z } from 'zod';

/**
 * Money handling (master spec §36).
 *
 * Prices are stored as integer minor units and never as floats: `42.15 SAR`
 * is `4215`, so no rounding error can reach a printed menu.
 *
 * Currencies differ in how many minor digits they use — Kuwaiti, Bahraini and
 * Omani currencies use three, not two — so the digit count is a property of
 * the currency, not a constant.
 */

export const SUPPORTED_CURRENCIES = ['SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'USD'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = 'SAR';

const MINOR_UNIT_DIGITS: Record<Currency, number> = {
  SAR: 2,
  AED: 2,
  KWD: 3,
  QAR: 2,
  BHD: 3,
  OMR: 3,
  USD: 2,
};

export const currencySchema = z.enum(SUPPORTED_CURRENCIES);

export function isSupportedCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function minorUnitDigits(currency: string): number {
  return isSupportedCurrency(currency) ? MINOR_UNIT_DIGITS[currency] : 2;
}

/**
 * Parses a human-entered price ("42", "42.50", "٤٢") into minor units.
 * Returns `null` for anything it cannot read with certainty — an ambiguous
 * price must fail an import row rather than be guessed (master spec §62).
 */
export function parsePriceToMinor(input: string | number | null | undefined, currency: string) {
  if (input === null || input === undefined) return null;

  const raw = String(input).trim();
  if (raw === '') return null;

  // Accept Eastern Arabic-Indic digits in imported spreadsheets.
  const normalized = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    // Thousands separators only: a plain space between digits ("4 2") is a
    // typo, not a separator, and must fail rather than silently become 42.
    .replace(/[,\u00a0\u202f\u2009\u066c]/g, '')
    .replace(/[٫،]/g, '.');

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const digits = minorUnitDigits(currency);
  const [whole = '0', fraction = ''] = normalized.split('.');
  if (fraction.length > digits) return null;

  const padded = fraction.padEnd(digits, '0');
  const minor = Number.parseInt(whole, 10) * 10 ** digits + Number.parseInt(padded || '0', 10);

  return Number.isSafeInteger(minor) ? minor : null;
}

/** Renders minor units as a plain decimal string for export and form fields. */
export function formatMinorAsDecimal(minor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  const divisor = 10 ** digits;
  const value = minor / divisor;
  // Minimal representation: spreadsheets and form fields read better without
  // trailing zeros, and the value round-trips through parsePriceToMinor.
  return Number.isInteger(value) ? String(value) : value.toFixed(digits).replace(/0+$/, '');
}
