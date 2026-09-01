import { describe, expect, it } from 'vitest';
import {
  TIMEZONE_OPTIONS,
  hasPublishedHours,
  openStateOf,
  workingHoursFromForm,
} from '@/server/business/hours';

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('opening hours — admin form', () => {
  it('builds a day from a single shift', () => {
    const hours = workingHoursFromForm(
      form({
        hours_timezone: 'Asia/Riyadh',
        hours_sunday_opens1: '09:00',
        hours_sunday_closes1: '17:00',
      }),
    );

    expect(hours?.timezone).toBe('Asia/Riyadh');
    expect(hours?.days.sunday).toEqual({
      closed: false,
      intervals: [{ opens: '09:00', closes: '17:00' }],
    });
  });

  it('builds a split shift from both interval slots', () => {
    const hours = workingHoursFromForm(
      form({
        hours_monday_opens1: '10:00',
        hours_monday_closes1: '13:30',
        hours_monday_opens2: '16:00',
        hours_monday_closes2: '21:00',
      }),
    );

    expect(hours?.days.monday?.intervals).toEqual([
      { opens: '10:00', closes: '13:30' },
      { opens: '16:00', closes: '21:00' },
    ]);
  });

  it('records a closed day as a statement, not an absence', () => {
    const hours = workingHoursFromForm(form({ hours_friday_closed: 'on' }));
    expect(hours?.days.friday).toEqual({ closed: true, intervals: [] });
  });

  it('lets the closed box win over times left in the row', () => {
    const hours = workingHoursFromForm(
      form({
        hours_friday_closed: 'on',
        hours_friday_opens1: '09:00',
        hours_friday_closes1: '17:00',
      }),
    );

    expect(hours?.days.friday).toEqual({ closed: true, intervals: [] });
  });

  it('drops a half-filled interval instead of failing the whole week', () => {
    const hours = workingHoursFromForm(
      form({
        hours_sunday_opens1: '09:00',
        hours_sunday_closes1: '17:00',
        hours_monday_opens1: '09:00', // no closing time
      }),
    );

    expect(hours?.days.sunday?.intervals).toHaveLength(1);
    expect(hours?.days.monday).toBeUndefined();
  });

  it('omits a day nobody described, rather than storing an empty one', () => {
    const hours = workingHoursFromForm(
      form({ hours_sunday_opens1: '09:00', hours_sunday_closes1: '17:00' }),
    );

    expect(Object.keys(hours?.days ?? {})).toEqual(['sunday']);
  });

  it('clears the field when the whole form is empty', () => {
    expect(workingHoursFromForm(form({ hours_timezone: 'Asia/Riyadh' }))).toBeNull();
  });

  it('falls back to the default timezone when none was chosen', () => {
    const hours = workingHoursFromForm(
      form({ hours_sunday_opens1: '09:00', hours_sunday_closes1: '17:00' }),
    );

    expect(hours?.timezone).toBe('Asia/Riyadh');
    expect(TIMEZONE_OPTIONS[0]).toBe('Asia/Riyadh');
  });

  it('accepts a shift that crosses midnight, and reads back as open at 01:00', () => {
    const hours = workingHoursFromForm(
      form({ hours_sunday_opens1: '20:00', hours_sunday_closes1: '02:00' }),
    );

    expect(hasPublishedHours(hours)).toBe(true);
    // 22:00 UTC Sunday is 01:00 Monday in Riyadh — inside Sunday's shift.
    expect(openStateOf(hours!, new Date('2026-08-30T22:00:00Z'))).toEqual({
      status: 'open',
      closesAt: '02:00',
    });
  });

  it('rejects a zero-length interval by dropping it', () => {
    const hours = workingHoursFromForm(
      form({ hours_sunday_opens1: '09:00', hours_sunday_closes1: '09:00' }),
    );

    expect(hours).toBeNull();
  });

  it('every offered timezone is one Intl actually knows', () => {
    for (const zone of TIMEZONE_OPTIONS) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: zone })).not.toThrow();
    }
  });
});
