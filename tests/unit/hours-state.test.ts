import { describe, expect, it } from 'vitest';
import {
  hasPublishedHours,
  localNow,
  openStateOf,
  parseWorkingHours,
  type WorkingHours,
} from '@/server/business/hours';

/** Riyadh is UTC+3 with no daylight saving, which keeps these cases readable. */
const RIYADH = 'Asia/Riyadh';

function hours(days: WorkingHours['days'], timezone = RIYADH): WorkingHours {
  return { timezone, days };
}

/** A Sunday. 09:00 UTC is 12:00 in Riyadh. */
const SUNDAY_NOON = new Date('2026-08-30T09:00:00Z');

describe('working hours — open state', () => {
  it('reports open inside an interval, with the closing time', () => {
    const state = openStateOf(
      hours({ sunday: { closed: false, intervals: [{ opens: '11:00', closes: '23:00' }] } }),
      SUNDAY_NOON,
    );

    expect(state).toEqual({ status: 'open', closesAt: '23:00' });
  });

  it('reports closed before opening, with today as the next opening', () => {
    const state = openStateOf(
      hours({ sunday: { closed: false, intervals: [{ opens: '17:00', closes: '23:00' }] } }),
      SUNDAY_NOON,
    );

    expect(state).toEqual({ status: 'closed', opensAt: '17:00', opensDay: 'sunday' });
  });

  it('handles a split shift — closed between the two intervals', () => {
    const split = hours({
      sunday: {
        closed: false,
        intervals: [
          { opens: '08:00', closes: '11:30' },
          { opens: '16:00', closes: '22:00' },
        ],
      },
    });

    expect(openStateOf(split, SUNDAY_NOON)).toEqual({
      status: 'closed',
      opensAt: '16:00',
      opensDay: 'sunday',
    });
  });

  it('stays open after midnight on an interval that crosses it', () => {
    // 22:00 UTC Sunday is 01:00 Riyadh on Monday — inside Sunday's 20:00–02:00.
    const state = openStateOf(
      hours({ sunday: { closed: false, intervals: [{ opens: '20:00', closes: '02:00' }] } }),
      new Date('2026-08-30T22:00:00Z'),
    );

    expect(state).toEqual({ status: 'open', closesAt: '02:00' });
  });

  it('is open late on the evening of an interval that crosses midnight', () => {
    // 20:30 UTC Sunday is 23:30 Riyadh, still Sunday.
    const state = openStateOf(
      hours({ sunday: { closed: false, intervals: [{ opens: '20:00', closes: '02:00' }] } }),
      new Date('2026-08-30T20:30:00Z'),
    );

    expect(state).toEqual({ status: 'open', closesAt: '02:00' });
  });

  it('skips days marked closed when searching for the next opening', () => {
    const state = openStateOf(
      hours({
        sunday: { closed: true, intervals: [] },
        monday: { closed: true, intervals: [] },
        tuesday: { closed: false, intervals: [{ opens: '09:00', closes: '17:00' }] },
      }),
      SUNDAY_NOON,
    );

    expect(state).toEqual({ status: 'closed', opensAt: '09:00', opensDay: 'tuesday' });
  });

  it('wraps to the following week when only an earlier day opens', () => {
    const state = openStateOf(
      hours({ saturday: { closed: false, intervals: [{ opens: '10:00', closes: '20:00' }] } }),
      SUNDAY_NOON,
    );

    expect(state).toEqual({ status: 'closed', opensAt: '10:00', opensDay: 'saturday' });
  });

  it('invents no opening time when the business lists none', () => {
    const state = openStateOf(hours({ sunday: { closed: true, intervals: [] } }), SUNDAY_NOON);
    expect(state).toEqual({ status: 'closed', opensAt: null, opensDay: null });
  });

  it('reads the clock in the business timezone, not the server one', () => {
    // 23:00 UTC is 02:00 the next day in Riyadh — a different weekday.
    const late = new Date('2026-08-30T23:00:00Z');
    expect(localNow(RIYADH, late)?.weekday).toBe('monday');
    expect(localNow('UTC', late)?.weekday).toBe('sunday');
  });

  it('degrades to unknown on an unusable timezone rather than throwing', () => {
    const state = openStateOf(
      hours({ sunday: { closed: false, intervals: [{ opens: '09:00', closes: '17:00' }] } }, 'Mars/Olympus'),
      SUNDAY_NOON,
    );

    expect(state).toEqual({ status: 'unknown' });
  });
});

describe('working hours — parsing and presence', () => {
  it('accepts a well-formed record', () => {
    const parsed = parseWorkingHours({
      timezone: RIYADH,
      days: { sunday: { closed: false, intervals: [{ opens: '09:00', closes: '17:00' }] } },
    });

    expect(parsed?.days.sunday?.intervals).toHaveLength(1);
  });

  it('rejects a malformed time rather than storing prose', () => {
    expect(
      parseWorkingHours({
        timezone: RIYADH,
        days: { sunday: { closed: false, intervals: [{ opens: '9am', closes: '5pm' }] } },
      }),
    ).toBeNull();
  });

  it('rejects a zero-length interval', () => {
    expect(
      parseWorkingHours({
        timezone: RIYADH,
        days: { sunday: { closed: false, intervals: [{ opens: '09:00', closes: '09:00' }] } },
      }),
    ).toBeNull();
  });

  it('treats an empty record as nothing to publish', () => {
    expect(hasPublishedHours(null)).toBe(false);
    expect(hasPublishedHours(hours({}))).toBe(false);
  });

  it('counts an explicit closed day as worth publishing', () => {
    expect(hasPublishedHours(hours({ friday: { closed: true, intervals: [] } }))).toBe(true);
  });
});
