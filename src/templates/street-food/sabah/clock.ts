import { useSyncExternalStore } from 'react';

/**
 * The visitor's clock, to the minute, for anything that depends on "now"
 * (opening hours, an offer ending soon). The server render has no clock: it
 * returns null there, so nothing time-dependent is baked into the HTML.
 */
function subscribeToMinutes(onChange: () => void) {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

function currentMinute(): number | null {
  return Math.floor(Date.now() / 60_000);
}

function noMinuteOnServer(): number | null {
  return null;
}

/** Minutes since the epoch, or null during the server render. */
export function useMinute(): number | null {
  return useSyncExternalStore(subscribeToMinutes, currentMinute, noMinuteOnServer);
}
