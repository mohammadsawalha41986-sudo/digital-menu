import { hasPublishedHours, openStateOf, type Weekday, type WorkingHours } from '@/server/business/hours';

const DAY_AR: Record<Weekday, string> = {
  sunday: 'الأحد',
  monday: 'الاثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
  friday: 'الجمعة',
  saturday: 'السبت',
};

/**
 * One line for the hero, footer and location card, from the restaurant's own
 * published hours: "open now, closes 23:00" or "closed, opens 10:00". Empty
 * when no hours were published — the design hides the line then, rather than
 * guessing.
 *
 * Evaluated in the visitor's browser, in the restaurant's timezone, so a
 * cached page never shows yesterday's answer.
 */
export function hoursLine(hours: WorkingHours | null | undefined, at: Date = new Date()) {
  if (!hasPublishedHours(hours ?? null)) return { ar: '', en: '' };

  const state = openStateOf(hours as WorkingHours, at);

  if (state.status === 'open') {
    return { ar: `مفتوح الآن · يغلق ${state.closesAt}`, en: `Open now · closes ${state.closesAt}` };
  }

  if (state.status === 'closed' && state.opensAt) {
    const sameDay = isToday(hours as WorkingHours, state.opensDay, at);
    const dayEn = state.opensDay.charAt(0).toUpperCase() + state.opensDay.slice(1);
    return sameDay
      ? { ar: `مغلق الآن · يفتح ${state.opensAt}`, en: `Closed · opens ${state.opensAt}` }
      : {
          ar: `مغلق الآن · يفتح ${DAY_AR[state.opensDay]} ${state.opensAt}`,
          en: `Closed · opens ${dayEn} ${state.opensAt}`,
        };
  }

  if (state.status === 'closed') return { ar: 'مغلق الآن', en: 'Closed now' };
  return { ar: '', en: '' };
}

function isToday(hours: WorkingHours, day: Weekday, at: Date): boolean {
  const name = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: hours.timezone })
    .format(at)
    .toLowerCase();
  return name === day;
}
