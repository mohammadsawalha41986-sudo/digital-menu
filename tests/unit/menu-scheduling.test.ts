import { describe, expect, it } from 'vitest';
import { isMenuLive, scheduleState, type MenuSchedule } from '@/server/menus/scheduling';

function schedule(overrides: Partial<MenuSchedule> = {}): MenuSchedule {
  return {
    startsAt: null,
    endsAt: null,
    dailyFrom: null,
    dailyTo: null,
    timezone: 'Asia/Riyadh',
    ...overrides,
  };
}

/** 09:00 UTC is 12:00 in Riyadh. */
const NOON = new Date('2026-08-30T09:00:00Z');

describe('menu scheduling — date windows', () => {
  it('serves a menu with no window at all, exactly as before scheduling existed', () => {
    expect(isMenuLive(schedule(), { at: NOON })).toBe(true);
    expect(scheduleState(schedule(), { at: NOON })).toBe('always');
  });

  it('does not serve a menu before it starts', () => {
    const seasonal = schedule({ startsAt: new Date('2026-09-01T00:00:00Z') });

    expect(isMenuLive(seasonal, { at: NOON })).toBe(false);
    expect(scheduleState(seasonal, { at: NOON })).toBe('not-yet');
  });

  it('stops serving a menu once it has ended, with no job required', () => {
    const ramadan = schedule({ endsAt: new Date('2026-08-01T00:00:00Z') });

    expect(isMenuLive(ramadan, { at: NOON })).toBe(false);
    expect(scheduleState(ramadan, { at: NOON })).toBe('ended');
  });

  it('serves a menu inside its season', () => {
    const summer = schedule({
      startsAt: new Date('2026-06-01T00:00:00Z'),
      endsAt: new Date('2026-09-30T00:00:00Z'),
    });

    expect(isMenuLive(summer, { at: NOON })).toBe(true);
    expect(scheduleState(summer, { at: NOON })).toBe('live');
  });
});

describe('menu scheduling — daily windows', () => {
  it('serves a breakfast menu in the morning and not at noon', () => {
    const breakfast = schedule({ dailyFrom: '06:00', dailyTo: '11:00' });

    // 04:00 UTC is 07:00 Riyadh.
    expect(isMenuLive(breakfast, { at: new Date('2026-08-30T04:00:00Z') })).toBe(true);
    expect(isMenuLive(breakfast, { at: NOON })).toBe(false);
    expect(scheduleState(breakfast, { at: NOON })).toBe('outside-hours');
  });

  it('handles a late menu that runs past midnight', () => {
    const late = schedule({ dailyFrom: '22:00', dailyTo: '02:00' });

    // 22:00 UTC is 01:00 Riyadh the next day — inside the window.
    expect(isMenuLive(late, { at: new Date('2026-08-30T22:00:00Z') })).toBe(true);
    // 20:00 UTC is 23:00 Riyadh — also inside.
    expect(isMenuLive(late, { at: new Date('2026-08-30T20:00:00Z') })).toBe(true);
    // Noon is not.
    expect(isMenuLive(late, { at: NOON })).toBe(false);
  });

  it('reads the daily window in the menu\'s own timezone', () => {
    const london = schedule({ dailyFrom: '09:00', dailyTo: '17:00', timezone: 'Europe/London' });

    // 09:00 UTC is 10:00 in London (BST) and 12:00 in Riyadh.
    expect(isMenuLive(london, { at: NOON })).toBe(true);
    expect(isMenuLive(schedule({ dailyFrom: '09:00', dailyTo: '17:00' }), { at: NOON })).toBe(true);
  });

  it('combines a season and a daily window', () => {
    const ramadanIftar = schedule({
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: new Date('2026-09-01T00:00:00Z'),
      dailyFrom: '18:00',
      dailyTo: '23:59',
    });

    expect(isMenuLive(ramadanIftar, { at: NOON })).toBe(false);
    // 16:00 UTC is 19:00 Riyadh, inside both windows.
    expect(isMenuLive(ramadanIftar, { at: new Date('2026-08-30T16:00:00Z') })).toBe(true);
  });
});

describe('menu scheduling — bad data fails open', () => {
  it('serves a menu whose daily window is malformed, rather than hiding it', () => {
    // A business must never lose its menu to a typo in a time field.
    const broken = schedule({ dailyFrom: 'morning', dailyTo: 'evening' });

    expect(isMenuLive(broken, { at: NOON })).toBe(true);
  });

  it('serves a menu whose timezone is unknown', () => {
    const broken = schedule({ dailyFrom: '09:00', dailyTo: '17:00', timezone: 'Mars/Olympus' });

    expect(isMenuLive(broken, { at: NOON })).toBe(true);
  });

  it('ignores half a daily window', () => {
    expect(isMenuLive(schedule({ dailyFrom: '09:00' }), { at: NOON })).toBe(true);
    expect(isMenuLive(schedule({ dailyTo: '17:00' }), { at: NOON })).toBe(true);
  });
});
