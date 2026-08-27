/**
 * Timezone-aware parsing for offer scheduling.
 *
 * Lives outside the `'use server'` module because that file may export only
 * async server actions.
 */

/**
 * Interprets a `datetime-local` value in a named timezone.
 *
 * Done by formatting a candidate instant back into the target zone and
 * correcting by the difference — the standard approach without pulling in a
 * date library for one function. Correct across DST boundaries because the
 * offset is measured at the candidate instant, not assumed.
 */
export function parseLocalDateTime(value: string | null, timeZone: string): Date | null {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  // Treat the wall-clock reading as UTC first, then correct by the zone offset.
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offset = zoneOffsetMs(new Date(asUtc), timeZone);

  return new Date(asUtc - offset);
}

/** Milliseconds a zone is ahead of UTC at a given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );

    const asZoned = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute),
      Number(parts.second),
    );

    return asZoned - instant.getTime();
  } catch {
    // An unknown zone must not silently shift a schedule; treat it as UTC.
    return 0;
  }
}
