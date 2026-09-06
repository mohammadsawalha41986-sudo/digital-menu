/**
 * Address policy for outbound link checking.
 *
 * Link Health is a feature whose entire job is to make the server fetch a URL
 * an operator typed. That is the textbook shape of SSRF: the attacker chooses
 * the address, the server has network positions they do not, and the response
 * or even the timing comes back to them. Everything here exists to make the
 * set of reachable addresses small and explicit.
 *
 * Kept as pure functions, separate from the fetching, because this is the part
 * that must be exhaustively tested and the part where a mistake is a
 * vulnerability rather than a bug.
 */

/** Only the two schemes a business link can plausibly be. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Ports the checker will connect to.
 *
 * An allowlist rather than a blocklist. Left open, a URL is a port scanner:
 * `http://10.0.0.5:6379/` reports a live Redis by how it fails, and a
 * blocklist of "dangerous" ports has to be right about every service anyone
 * will ever run.
 */
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

export type AddressRefusal =
  | 'protocol'
  | 'port'
  | 'credentials'
  | 'malformed'
  | 'private-address'
  | 'not-a-hostname';

export interface AddressVerdict {
  ok: boolean;
  reason?: AddressRefusal;
  detail?: string;
}

const OK: AddressVerdict = { ok: true };

function refuse(reason: AddressRefusal, detail: string): AddressVerdict {
  return { ok: false, reason, detail };
}

/**
 * Checks a URL's *shape*, before any name resolution.
 *
 * Everything here can be decided from the string, so it runs first and cheaply
 * — a `file:` URL should never reach a DNS query.
 */
export function inspectUrl(raw: string): AddressVerdict {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return refuse('malformed', 'Not a URL.');
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return refuse('protocol', `Refused scheme ${url.protocol}`);
  }

  // `http://user:pass@host/` would hand the operator's credentials to whatever
  // the hostname currently resolves to, and is never what a public profile
  // link should contain.
  if (url.username || url.password) {
    return refuse('credentials', 'URL carries credentials.');
  }

  if (!ALLOWED_PORTS.has(url.port)) {
    return refuse('port', `Refused port ${url.port}`);
  }

  if (!url.hostname) return refuse('not-a-hostname', 'No host.');

  // A bare IP literal is not blocked here — it is resolved and range-checked
  // below like anything else, so `http://127.0.0.1/` and a hostname that
  // resolves to 127.0.0.1 are refused by the same rule.
  return OK;
}

/* -------------------------------------------------------------------------- */
/* IP ranges                                                                   */
/* -------------------------------------------------------------------------- */

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;

  let value = 0;

  for (const part of parts) {
    // Rejects '', '01', '256' and anything non-numeric. Octal-looking octets
    // matter: some resolvers read `0177.0.0.1` as 127.0.0.1.
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }

  return value;
}

/** CIDR blocks that must never be reachable, as [network, prefix length]. */
const BLOCKED_V4: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC 1918
  ['100.64.0.0', 10], // RFC 6598 carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — the cloud metadata service lives here
  ['172.16.0.0', 12], // RFC 1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // RFC 1918
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes 255.255.255.255
];

function isBlockedIpv4(address: string): boolean {
  const value = ipv4ToInt(address);
  if (value === null) return true; // Unparseable: refuse rather than guess.

  for (const [network, prefix] of BLOCKED_V4) {
    const base = ipv4ToInt(network);
    if (base === null) continue;

    // >>> 0 keeps the shift unsigned; a /0 mask would otherwise be -1.
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    if ((value & mask) >>> 0 === (base & mask) >>> 0) return true;
  }

  return false;
}

function isBlockedIpv6(address: string): boolean {
  const lower = address.toLowerCase().split('%')[0] ?? '';

  // IPv4-mapped and IPv4-compatible forms (::ffff:127.0.0.1) reach the v4
  // address, so they are judged as that v4 address.
  const mapped = /^::(?:ffff:(?:0{1,4}:)?)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (mapped?.[1]) return isBlockedIpv4(mapped[1]);

  if (lower === '::' || lower === '::1') return true; // unspecified, loopback
  if (lower.startsWith('fe80')) return true; // link-local
  if (/^f[cd]/.test(lower)) return true; // unique local, fc00::/7
  if (lower.startsWith('ff')) return true; // multicast
  if (lower.startsWith('2001:db8')) return true; // documentation
  if (lower.startsWith('64:ff9b')) return true; // NAT64, a v4 range in disguise
  if (lower.startsWith('2002:')) return true; // 6to4, likewise

  return false;
}

/**
 * Whether an address the resolver returned may be connected to.
 *
 * Refuses anything it cannot parse. A checker that fails open on a strange
 * address is a checker with no policy at all.
 */
export function isBlockedAddress(address: string, family: 4 | 6): boolean {
  return family === 4 ? isBlockedIpv4(address) : isBlockedIpv6(address);
}
