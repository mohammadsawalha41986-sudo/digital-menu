import { z } from 'zod';

/**
 * Working hours (master spec §20, §44).
 *
 * Stored as structured JSON rather than free text so the public profile can
 * say "open now" later without parsing prose, and so Arabic and English
 * renderings come from the same data instead of two authored strings.
 */

export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM in 24-hour form');

const intervalSchema = z
  .object({ opens: timeSchema, closes: timeSchema })
  .refine((value) => value.opens !== value.closes, 'An interval cannot be zero-length');

const daySchema = z.object({
  closed: z.boolean().default(false),
  /** Multiple intervals support a split shift (e.g. a salon closing midday). */
  intervals: z.array(intervalSchema).max(3).default([]),
});

export const workingHoursSchema = z.object({
  timezone: z.string().min(1).default('Asia/Riyadh'),
  // Partial: a business may describe only the days it opens.
  days: z.partialRecord(z.enum(WEEKDAYS), daySchema),
});

export type WorkingHours = z.infer<typeof workingHoursSchema>;

/** Parses stored JSON, returning null rather than throwing on legacy shapes. */
export function parseWorkingHours(value: unknown): WorkingHours | null {
  const result = workingHoursSchema.safeParse(value);
  return result.success ? result.data : null;
}

/* -------------------------------------------------------------------------- */
/* Open/closed state                                                          */
/* -------------------------------------------------------------------------- */

/**
 * "Open now" is computed in the *business's* timezone, never the visitor's.
 * A diner in London looking at a Riyadh café wants to know whether the café is
 * open, not whether it would be open in London.
 *
 * Intervals may cross midnight (`22:00`–`02:00`), which is ordinary for a
 * restaurant and the reason this is not a simple range check: an interval that
 * closes before it opens belongs to the *previous* day as far as 01:00 is
 * concerned, so both today's and yesterday's intervals are considered.
 */

export type OpenState =
  | { status: 'open'; closesAt: string }
  | { status: 'closed'; opensAt: string; opensDay: Weekday }
  | { status: 'closed'; opensAt: null; opensDay: null }
  | { status: 'unknown' };

interface LocalNow {
  weekday: Weekday;
  /** Minutes since local midnight. */
  minutes: number;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

function fromMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hours = String(Math.floor(wrapped / 60)).padStart(2, '0');
  const minutes = String(wrapped % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Reads the wall clock in a named timezone. `Intl` is used rather than date
 * arithmetic because it already knows every daylight-saving rule, including
 * the ones that change between releases.
 */
export function localNow(timezone: string, at: Date = new Date()): LocalNow | null {
  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
  } catch {
    // An unknown timezone is a data problem, not a reason to crash a profile.
    return null;
  }

  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const weekday = lookup('weekday').toLowerCase() as Weekday;
  if (!WEEKDAYS.includes(weekday)) return null;

  return { weekday, minutes: Number(lookup('hour')) * 60 + Number(lookup('minute')) };
}

function dayAt(offset: number, from: Weekday): Weekday {
  const index = WEEKDAYS.indexOf(from);
  return WEEKDAYS[(index + offset + WEEKDAYS.length * 2) % WEEKDAYS.length] as Weekday;
}

/**
 * Resolves the current state, and — when closed — the next time the business
 * opens, searched across the coming week. A business that lists no open
 * interval at all reports `opensAt: null` rather than an invented time.
 */
export function openStateOf(hours: WorkingHours, at: Date = new Date()): OpenState {
  const now = localNow(hours.timezone, at);
  if (!now) return { status: 'unknown' };

  const intervalsFor = (day: Weekday) => {
    const entry = hours.days[day];
    if (!entry || entry.closed) return [];
    return entry.intervals;
  };

  // Yesterday's overnight interval can still be running.
  for (const interval of intervalsFor(dayAt(-1, now.weekday))) {
    const opens = toMinutes(interval.opens);
    const closes = toMinutes(interval.closes);
    if (closes < opens && now.minutes < closes) {
      return { status: 'open', closesAt: interval.closes };
    }
  }

  for (const interval of intervalsFor(now.weekday)) {
    const opens = toMinutes(interval.opens);
    const closes = toMinutes(interval.closes);
    const running =
      closes > opens
        ? now.minutes >= opens && now.minutes < closes
        : now.minutes >= opens; // crosses midnight — still open at 23:59
    if (running) return { status: 'open', closesAt: interval.closes };
  }

  // Closed. Find the next opening, today first, then the following six days.
  const laterToday = intervalsFor(now.weekday)
    .map((interval) => toMinutes(interval.opens))
    .filter((opens) => opens > now.minutes)
    .sort((a, b) => a - b)[0];

  if (laterToday !== undefined) {
    return { status: 'closed', opensAt: fromMinutes(laterToday), opensDay: now.weekday };
  }

  for (let offset = 1; offset <= 7; offset += 1) {
    const day = dayAt(offset, now.weekday);
    const earliest = intervalsFor(day)
      .map((interval) => toMinutes(interval.opens))
      .sort((a, b) => a - b)[0];

    if (earliest !== undefined) {
      return { status: 'closed', opensAt: fromMinutes(earliest), opensDay: day };
    }
  }

  return { status: 'closed', opensAt: null, opensDay: null };
}

/** True when at least one day carries an interval worth rendering. */
export function hasPublishedHours(hours: WorkingHours | null): hours is WorkingHours {
  if (!hours) return false;
  return WEEKDAYS.some((day) => {
    const entry = hours.days[day];
    return Boolean(entry && (entry.closed || entry.intervals.length > 0));
  });
}

/* -------------------------------------------------------------------------- */
/* Admin form encoding                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Reads working hours out of an ordinary HTML form.
 *
 * The encoding is flat — `hours_sunday_opens1`, `hours_sunday_closes1`, and a
 * `hours_sunday_closed` checkbox — because the editor has to work with no
 * JavaScript, on a phone, using native time inputs. A nested JSON payload
 * would be tidier to read here and worse to use there.
 *
 * A day with neither a closed flag nor a complete interval is omitted rather
 * than stored empty: the profile hides a field it has no data for, and a day
 * nobody filled in is missing data, not a claim that the business is shut.
 */
export function workingHoursFromForm(
  formData: Pick<FormData, 'get'>,
  fallbackTimezone = 'Asia/Riyadh',
): WorkingHours | null {
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };

  const timezone = read('hours_timezone') || fallbackTimezone;
  const days: WorkingHours['days'] = {};

  for (const day of WEEKDAYS) {
    if (read(`hours_${day}_closed`)) {
      days[day] = { closed: true, intervals: [] };
      continue;
    }

    const intervals: { opens: string; closes: string }[] = [];

    for (const slot of [1, 2]) {
      const opens = read(`hours_${day}_opens${slot}`);
      const closes = read(`hours_${day}_closes${slot}`);
      // Half a range is operator error, not data. Skipping it keeps a
      // mistyped second shift from invalidating the whole week.
      if (opens && closes && opens !== closes) intervals.push({ opens, closes });
    }

    if (intervals.length > 0) days[day] = { closed: false, intervals };
  }

  const parsed = workingHoursSchema.safeParse({ timezone, days });
  if (!parsed.success) return null;

  // Nothing described at all clears the field rather than storing an empty husk.
  return hasPublishedHours(parsed.data) ? parsed.data : null;
}

/** Timezones offered in the editor. Saudi first, then the rest of the Gulf. */
export const TIMEZONE_OPTIONS = [
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Qatar',
  'Asia/Kuwait',
  'Asia/Bahrain',
  'Asia/Muscat',
  'Africa/Cairo',
  'Europe/London',
  'UTC',
] as const;
