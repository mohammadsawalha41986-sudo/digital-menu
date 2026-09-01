import { localNow } from '@/server/business/hours';

/**
 * Menu scheduling (master spec §57).
 *
 * A breakfast menu, a Ramadan menu, a seasonal one. Two independent windows:
 *
 *  - a **date window**, for a menu that runs for a season, and
 *  - a **daily window**, for one served only between certain hours.
 *
 * Both are evaluated at read time from the stored values, never by a job
 * flipping a flag. That is the same choice offers already make, for the same
 * reason: a cron that fails leaves last month's menu on a customer's phone,
 * and the failure is invisible until a customer orders from it.
 *
 * A menu with neither window is always served, so every menu that existed
 * before scheduling behaves exactly as it did.
 */

export interface MenuSchedule {
  startsAt: Date | null;
  endsAt: Date | null;
  dailyFrom: string | null;
  dailyTo: string | null;
  timezone: string | null;
}

function toMinutes(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Whether the daily window is open.
 *
 * A closing time earlier than the opening one runs past midnight — a late
 * menu served 22:00–02:00 is ordinary, and a naive comparison calls it closed
 * all night.
 */
function withinDaily(
  schedule: MenuSchedule,
  fallbackTimezone: string,
  at: Date,
): boolean {
  if (!schedule.dailyFrom || !schedule.dailyTo) return true;

  const from = toMinutes(schedule.dailyFrom);
  const to = toMinutes(schedule.dailyTo);

  // A malformed window serves the menu rather than hiding it: bad data must
  // not silently remove a business's menu from its own profile.
  if (from === null || to === null) return true;

  const now = localNow(schedule.timezone ?? fallbackTimezone, at);
  if (!now) return true;

  return to > from ? now.minutes >= from && now.minutes < to : now.minutes >= from || now.minutes < to;
}

export function isMenuLive(
  schedule: MenuSchedule,
  options: { timezone?: string; at?: Date } = {},
): boolean {
  const at = options.at ?? new Date();
  const timezone = options.timezone ?? 'Asia/Riyadh';

  if (schedule.startsAt && schedule.startsAt.getTime() > at.getTime()) return false;
  if (schedule.endsAt && schedule.endsAt.getTime() <= at.getTime()) return false;

  return withinDaily(schedule, timezone, at);
}

/** Why a menu is not being served, for the admin screen. */
export function scheduleState(
  schedule: MenuSchedule,
  options: { timezone?: string; at?: Date } = {},
): 'always' | 'live' | 'not-yet' | 'ended' | 'outside-hours' {
  const at = options.at ?? new Date();

  const hasWindow =
    schedule.startsAt !== null ||
    schedule.endsAt !== null ||
    (schedule.dailyFrom !== null && schedule.dailyTo !== null);

  if (!hasWindow) return 'always';

  if (schedule.startsAt && schedule.startsAt.getTime() > at.getTime()) return 'not-yet';
  if (schedule.endsAt && schedule.endsAt.getTime() <= at.getTime()) return 'ended';
  if (!withinDaily(schedule, options.timezone ?? 'Asia/Riyadh', at)) return 'outside-hours';

  return 'live';
}
