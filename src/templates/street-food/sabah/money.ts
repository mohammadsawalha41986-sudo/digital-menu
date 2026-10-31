import { minorUnitDigits } from '@/lib/money';

/**
 * Prices in the menu design follow the restaurant's own currency: its symbol
 * in each language, and its number of decimals (three for KWD, BHD, OMR).
 */
const UNITS: Record<string, { ar: string; en: string }> = {
  SAR: { ar: 'ر.س', en: 'SAR' },
  AED: { ar: 'د.إ', en: 'AED' },
  KWD: { ar: 'د.ك', en: 'KWD' },
  QAR: { ar: 'ر.ق', en: 'QAR' },
  BHD: { ar: 'د.ب', en: 'BHD' },
  OMR: { ar: 'ر.ع', en: 'OMR' },
  USD: { ar: '$', en: 'USD' },
};

export function currencyUnit(currency: string, isAr: boolean): string {
  const unit = UNITS[currency];
  if (!unit) return currency;
  return isAr ? unit.ar : unit.en;
}

export function formatAmount(value: number, currency: string): string {
  return value.toFixed(minorUnitDigits(currency));
}
