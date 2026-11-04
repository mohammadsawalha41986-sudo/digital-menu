import { isValidPhone, toLatinDigits } from './delivery';
import { minorUnitDigits } from './money';

/**
 * Shared rules for the customers a menu collects: how a phone number is
 * stored, and how a cart amount becomes minor units. Used by the public
 * endpoints and by the admin screens, so both read a number the same way.
 */

export const ORDER_TYPES = ['takeaway', 'dineIn', 'delivery'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export function isOrderType(value: unknown): value is OrderType {
  return typeof value === 'string' && (ORDER_TYPES as readonly string[]).includes(value);
}

/** The country a local number (0…) belongs to, read from the restaurant's currency. */
const COUNTRY_BY_CURRENCY: Record<string, string> = {
  SAR: '966',
  AED: '971',
  KWD: '965',
  QAR: '974',
  BHD: '973',
  OMR: '968',
  JOD: '962',
  EGP: '20',
};

export function countryCodeFor(currency: string): string {
  return COUNTRY_BY_CURRENCY[currency] ?? '966';
}

/**
 * A phone number as stored: international digits, no plus sign, so one
 * customer is one row however they typed it. "05x xxx xxxx", "+9665…",
 * "009665…" and Arabic-Indic digits all become "9665…". Null when the text
 * is not a phone number.
 */
export function normalizePhone(input: string, countryCode = '966'): string | null {
  if (!input || !isValidPhone(input)) return null;
  let digits = toLatinDigits(input).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = countryCode + digits.slice(1);
  else if (countryCode === '966' && /^5\d{8}$/.test(digits)) digits = countryCode + digits;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** A cart amount (major units, as the menu shows it) in minor units; null when it is not an amount. */
export function toMinorUnits(amount: unknown, currency: string): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 10 ** minorUnitDigits(currency));
}

/** A chat with the customer on WhatsApp. */
export function whatsappChatLink(phone: string): string {
  return `https://wa.me/${phone}`;
}

/** Text written into a CSV cell, safe to open in Excel: a leading = + - @ is not run as a formula. */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
