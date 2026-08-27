import { describe, expect, it } from 'vitest';
import { parseWorkingHours } from '@/server/business/hours';

describe('working hours', () => {
  it('accepts a structured week', () => {
    const parsed = parseWorkingHours({
      timezone: 'Asia/Riyadh',
      days: {
        sunday: { closed: false, intervals: [{ opens: '08:00', closes: '23:00' }] },
        friday: { closed: true, intervals: [] },
      },
    });

    expect(parsed?.days.sunday?.intervals[0]?.opens).toBe('08:00');
    expect(parsed?.days.friday?.closed).toBe(true);
  });

  it('supports a split shift', () => {
    const parsed = parseWorkingHours({
      timezone: 'Asia/Riyadh',
      days: {
        monday: {
          closed: false,
          intervals: [
            { opens: '09:00', closes: '13:00' },
            { opens: '16:00', closes: '22:00' },
          ],
        },
      },
    });

    expect(parsed?.days.monday?.intervals).toHaveLength(2);
  });

  it('rejects malformed times rather than rendering nonsense', () => {
    expect(parseWorkingHours({ timezone: 'Asia/Riyadh', days: { sunday: { intervals: [{ opens: '25:00', closes: '26:00' }] } } })).toBeNull();
    expect(parseWorkingHours({ days: { sunday: { intervals: [{ opens: '9am', closes: '11pm' }] } } })).toBeNull();
  });

  it('returns null for legacy free-text hours instead of throwing', () => {
    expect(parseWorkingHours('Daily 9-11')).toBeNull();
    expect(parseWorkingHours(null)).toBeNull();
  });
});
