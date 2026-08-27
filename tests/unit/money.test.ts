import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CURRENCY,
  formatMinorAsDecimal,
  isSupportedCurrency,
  minorUnitDigits,
  parsePriceToMinor,
} from '@/lib/money';

describe('money', () => {
  it('defaults to SAR (master spec §36)', () => {
    expect(DEFAULT_CURRENCY).toBe('SAR');
  });

  it('knows which currencies use three minor digits', () => {
    expect(minorUnitDigits('SAR')).toBe(2);
    expect(minorUnitDigits('KWD')).toBe(3);
    expect(minorUnitDigits('BHD')).toBe(3);
    expect(minorUnitDigits('OMR')).toBe(3);
    // Unknown currency falls back to the common case rather than throwing.
    expect(minorUnitDigits('XYZ')).toBe(2);
  });

  it('parses ordinary prices into minor units', () => {
    expect(parsePriceToMinor('42', 'SAR')).toBe(4200);
    expect(parsePriceToMinor('42.50', 'SAR')).toBe(4250);
    expect(parsePriceToMinor(38, 'SAR')).toBe(3800);
    expect(parsePriceToMinor('1,250.75', 'SAR')).toBe(125075);
    expect(parsePriceToMinor('5.125', 'KWD')).toBe(5125);
  });

  it('reads Eastern Arabic-Indic digits from imported spreadsheets', () => {
    expect(parsePriceToMinor('٤٢', 'SAR')).toBe(4200);
    expect(parsePriceToMinor('٤٢٫٥٠', 'SAR')).toBe(4250);
  });

  it('refuses to guess an ambiguous price', () => {
    // Better to fail an import row than to publish a wrong price (§62).
    for (const input of ['abc', '42.999', '', '  ', '4 2', '-5', '42..5']) {
      expect(parsePriceToMinor(input, 'SAR'), String(input)).toBeNull();
    }
    expect(parsePriceToMinor(null, 'SAR')).toBeNull();
    expect(parsePriceToMinor(undefined, 'SAR')).toBeNull();
  });

  it('round-trips through the export representation', () => {
    for (const [decimal, currency] of [
      ['42', 'SAR'],
      ['42.5', 'SAR'],
      ['5.125', 'KWD'],
    ] as const) {
      const minor = parsePriceToMinor(decimal, currency);
      expect(minor).not.toBeNull();
      expect(formatMinorAsDecimal(minor as number, currency)).toBe(decimal);
    }
  });

  it('validates currency codes', () => {
    expect(isSupportedCurrency('SAR')).toBe(true);
    expect(isSupportedCurrency('BTC')).toBe(false);
  });
});
