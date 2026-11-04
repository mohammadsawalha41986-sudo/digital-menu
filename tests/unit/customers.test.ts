import { describe, expect, it } from 'vitest';
import { countryCodeFor, csvCell, isOrderType, normalizePhone, toMinorUnits } from '@/lib/customers';

describe('normalizePhone', () => {
  it('stores one number however it was typed', () => {
    for (const typed of ['0551234567', '055 123 4567', '+966551234567', '00966551234567', '٠٥٥١٢٣٤٥٦٧', '551234567']) {
      expect(normalizePhone(typed)).toBe('966551234567');
    }
  });

  it('uses the restaurant’s country for a local number', () => {
    expect(normalizePhone('0501234567', countryCodeFor('AED'))).toBe('971501234567');
    expect(countryCodeFor('XYZ')).toBe('966');
  });

  it('refuses what is not a phone number', () => {
    for (const typed of ['', 'abc', '12', '05512345678901234567']) {
      expect(normalizePhone(typed)).toBeNull();
    }
  });
});

describe('toMinorUnits', () => {
  it('reads cart amounts in the currency’s minor units', () => {
    expect(toMinorUnits(25.5, 'SAR')).toBe(2550);
    expect(toMinorUnits(1.235, 'KWD')).toBe(1235);
    expect(toMinorUnits(0, 'SAR')).toBe(0);
  });

  it('refuses what is not an amount', () => {
    for (const value of [-1, Number.NaN, Infinity, '12', null]) expect(toMinorUnits(value, 'SAR')).toBeNull();
  });
});

describe('csvCell', () => {
  it('never lets a cell run as a spreadsheet formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@sum')).toBe("'@sum");
  });

  it('quotes commas and keeps plain text as it is', () => {
    expect(csvCell('أحمد، علي')).toBe('أحمد، علي');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell(null)).toBe('');
  });
});

it('knows the three order types', () => {
  expect(['takeaway', 'dineIn', 'delivery'].every(isOrderType)).toBe(true);
  expect(isOrderType('pickup')).toBe(false);
});
