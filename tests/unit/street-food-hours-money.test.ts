import { describe, expect, it } from 'vitest';
import { hoursLine } from '@/templates/street-food/sabah/hours';
import { currencyUnit, formatAmount } from '@/templates/street-food/sabah/money';
import type { WorkingHours } from '@/server/business/hours';

const HOURS: WorkingHours = {
  timezone: 'Asia/Riyadh',
  days: {
    sunday: { closed: false, intervals: [{ opens: '10:00', closes: '23:00' }] },
    monday: { closed: false, intervals: [{ opens: '10:00', closes: '23:00' }] },
  },
};

// 2026-11-01 is a Sunday. Riyadh is UTC+3.
const sundayAt = (hhmm: string) => new Date(`2026-11-01T${hhmm}:00+03:00`);

describe('hoursLine', () => {
  it('says open, and when it closes, from the restaurant’s own hours', () => {
    expect(hoursLine(HOURS, sundayAt('12:00'))).toEqual({
      ar: 'مفتوح الآن · يغلق 23:00',
      en: 'Open now · closes 23:00',
    });
  });

  it('says when a closed restaurant opens, naming the day when it is not today', () => {
    expect(hoursLine(HOURS, sundayAt('08:00')).en).toBe('Closed · opens 10:00');
    expect(hoursLine(HOURS, sundayAt('23:30')).en).toBe('Closed · opens Monday 10:00');
    expect(hoursLine(HOURS, sundayAt('23:30')).ar).toBe('مغلق الآن · يفتح الاثنين 10:00');
  });

  it('claims nothing when no hours were published', () => {
    expect(hoursLine(null)).toEqual({ ar: '', en: '' });
  });
});

describe('menu money', () => {
  it('uses the restaurant’s currency and its decimals', () => {
    expect(formatAmount(1.25, 'KWD')).toBe('1.250');
    expect(formatAmount(12.5, 'SAR')).toBe('12.50');
    expect(currencyUnit('AED', true)).toBe('د.إ');
    expect(currencyUnit('AED', false)).toBe('AED');
  });
});
