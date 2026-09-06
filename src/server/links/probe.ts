import { lookup } from 'node:dns/promises';
import { inspectUrl, isBlockedAddress } from './address';

/**
 * Probes one external URL, under an address policy.
 *
 * Design constraints, all of them because the operator chooses the address:
 *
 *  - **Every hop is checked.** Redirects are followed manually, and each new
 *    location goes through the same shape and address checks. Handing the
 *    redirect to `fetch` would let `https://example.com/r` bounce to
 *    `http://169.254.169.254/` with nothing looking at the second address.
 *  - **Resolution is checked, not the hostname.** A name the attacker controls
 *    can resolve to anything, so the verdict is on the resolved addresses.
 *  - **Bounded everywhere**: total time, hop count, and bytes read. A probe is
 *    allowed to be slow, not unbounded.
 *  - **Nothing is sent.** No cookies, no credentials, no operator identity.
 *
 * A residual DNS-rebinding window remains: the name is resolved for the check
 * and resolved again by the connection. Closing it needs connecting to the
 * checked address directly with the Host header preserved, which the platform
 * fetch does not expose. The mitigation is that a probe reports only a status
 * class, never a body, so a successful rebind yields "this address answered" —
 * documented in docs/SECURITY.md rather than left as a surprise.
 */

export type LinkStatus = 'WORKING' | 'BROKEN' | 'BLOCKED';

export interface ProbeResult {
  status: LinkStatus;
  httpStatus: number | null;
  /** Short, operator-facing explanation. Never carries response content. */
  reason: string;
}

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5_000;
/** Enough to know a page answered; a probe never needs the page. */
const MAX_BYTES = 64 * 1024;

const USER_AGENT = 'DigitalProfileOS-LinkCheck/1.0 (+link health)';

async function addressesAllowed(hostname: string): Promise<string | null> {
  // Strips the brackets of an IPv6 literal, which `URL` keeps.
  const host = hostname.replace(/^\[|\]$/g, '');

  let records: { address: string; family: number }[];

  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    return 'The address could not be resolved.';
  }

  if (records.length === 0) return 'The address could not be resolved.';

  // *Every* address must be allowed, not merely one: a name that resolves to
  // both a public address and 127.0.0.1 is an attack, not a fallback.
  for (const record of records) {
    if (isBlockedAddress(record.address, record.family === 6 ? 6 : 4)) {
      return 'The address resolves to a private or reserved network.';
    }
  }

  return null;
}

export async function probeLink(raw: string): Promise<ProbeResult> {
  const started = Date.now();
  let target = raw;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const shape = inspectUrl(target);

    if (!shape.ok) {
      return { status: 'BLOCKED', httpStatus: null, reason: shape.detail ?? 'Refused.' };
    }

    const url = new URL(target);
    const blocked = await addressesAllowed(url.hostname);

    if (blocked) return { status: 'BLOCKED', httpStatus: null, reason: blocked };

    const remaining = TIMEOUT_MS - (Date.now() - started);
    if (remaining <= 0) return { status: 'BROKEN', httpStatus: null, reason: 'Timed out.' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'GET',
        // Manual, so the next address is checked before it is contacted.
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: '*/*' },
        // Belt and braces: the platform fetch sends no ambient cookies here,
        // and this says so explicitly rather than relying on the default.
        credentials: 'omit',
      });
    } catch (error) {
      clearTimeout(timer);

      const aborted = (error as Error).name === 'AbortError';
      return {
        status: 'BROKEN',
        httpStatus: null,
        reason: aborted ? 'Timed out.' : 'The server could not be reached.',
      };
    }

    clearTimeout(timer);

    const location = response.headers.get('location');

    if (response.status >= 300 && response.status < 400 && location) {
      // Drain nothing: the body of a redirect is not wanted, and leaving it
      // undrained leaks the socket.
      await response.body?.cancel();

      if (hop === MAX_REDIRECTS) {
        return { status: 'BROKEN', httpStatus: response.status, reason: 'Too many redirects.' };
      }

      try {
        target = new URL(location, url).toString();
      } catch {
        return { status: 'BROKEN', httpStatus: response.status, reason: 'Redirected nowhere.' };
      }

      continue;
    }

    await readCapped(response);

    if (response.status >= 200 && response.status < 400) {
      return { status: 'WORKING', httpStatus: response.status, reason: `Answered ${response.status}.` };
    }

    // 401 and 403 mean the address is live but private — a members' page, an
    // Instagram profile behind a login wall. Reporting those as broken sends
    // operators to fix links that are fine.
    if (response.status === 401 || response.status === 403) {
      return {
        status: 'WORKING',
        httpStatus: response.status,
        reason: `Answered ${response.status} — reachable, but it refuses anonymous visitors.`,
      };
    }

    return { status: 'BROKEN', httpStatus: response.status, reason: `Answered ${response.status}.` };
  }

  return { status: 'BROKEN', httpStatus: null, reason: 'Too many redirects.' };
}

/**
 * Reads at most `MAX_BYTES` and then stops, so a response that never ends
 * cannot hold the checker open or fill its memory. The bytes are discarded —
 * the probe reports a status, never content.
 */
async function readCapped(response: Response): Promise<void> {
  const body = response.body;
  if (!body) return;

  const reader = body.getReader();
  let read = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      read += value?.byteLength ?? 0;
      if (read >= MAX_BYTES) break;
    }
  } catch {
    // A truncated body is not a failure: the status line already arrived.
  } finally {
    await reader.cancel().catch(() => {});
  }
}
