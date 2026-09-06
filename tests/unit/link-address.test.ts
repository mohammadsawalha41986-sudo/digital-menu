import { describe, expect, it } from 'vitest';
import { inspectUrl, isBlockedAddress } from '@/server/links/address';

/**
 * The address policy behind Link Health.
 *
 * This is the file where a mistake is a vulnerability rather than a bug: the
 * feature exists to make the server fetch a URL an operator typed, which is
 * the exact shape of SSRF. Each case below is an attack someone has actually
 * used, not a hypothetical.
 */

describe('inspectUrl', () => {
  it('allows ordinary web addresses', () => {
    for (const url of [
      'https://example.com',
      'http://example.com/menu',
      'https://example.com:443/x?y=1',
      'https://sub.example.co.uk:8443/path',
    ]) {
      expect(inspectUrl(url), url).toMatchObject({ ok: true });
    }
  });

  it('refuses schemes that are not the web', () => {
    // file: reads the server's disk; gopher: and dict: are classic SSRF
    // gadgets for speaking other protocols through an HTTP client.
    for (const url of [
      'file:///etc/passwd',
      'gopher://example.com/_x',
      'dict://example.com:11211/stat',
      'ftp://example.com/x',
      'data:text/html,hi',
      'javascript:alert(1)',
    ]) {
      expect(inspectUrl(url), url).toMatchObject({ ok: false, reason: 'protocol' });
    }
  });

  it('refuses credentials in the URL', () => {
    expect(inspectUrl('https://user:secret@example.com')).toMatchObject({
      ok: false,
      reason: 'credentials',
    });
  });

  it('refuses ports outside the web set, so it cannot be used as a port scanner', () => {
    for (const url of [
      'http://example.com:22/',
      'http://example.com:6379/',
      'http://example.com:3306/',
      'http://example.com:11211/',
      'http://example.com:5432/',
    ]) {
      expect(inspectUrl(url), url).toMatchObject({ ok: false, reason: 'port' });
    }
  });

  it('refuses something that is not a URL at all', () => {
    expect(inspectUrl('not a url')).toMatchObject({ ok: false, reason: 'malformed' });
    expect(inspectUrl('')).toMatchObject({ ok: false, reason: 'malformed' });
  });

  it('leaves the address decision to the resolver, including for IP literals', () => {
    // Shape-legal. `probeLink` refuses it on the address check, which is what
    // makes a hostname resolving to 127.0.0.1 refused by the same rule.
    expect(inspectUrl('http://127.0.0.1/')).toMatchObject({ ok: true });
  });
});

describe('isBlockedAddress, IPv4', () => {
  it('blocks loopback', () => {
    for (const address of ['127.0.0.1', '127.0.0.53', '127.255.255.254']) {
      expect(isBlockedAddress(address, 4), address).toBe(true);
    }
  });

  it('blocks the cloud metadata service', () => {
    // The single most valuable SSRF target there is: instance credentials.
    expect(isBlockedAddress('169.254.169.254', 4)).toBe(true);
    expect(isBlockedAddress('169.254.0.1', 4)).toBe(true);
  });

  it('blocks the RFC 1918 ranges', () => {
    for (const address of ['10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.1']) {
      expect(isBlockedAddress(address, 4), address).toBe(true);
    }
  });

  it('does not over-block the neighbours of those ranges', () => {
    // 172.15 and 172.32 are public; a /12 mistaken for a /8 would swallow them.
    for (const address of ['172.15.255.255', '172.32.0.1', '11.0.0.1', '192.167.255.255', '193.168.0.1']) {
      expect(isBlockedAddress(address, 4), address).toBe(false);
    }
  });

  it('blocks carrier-grade NAT, multicast, reserved and this-network', () => {
    for (const address of ['100.64.0.1', '100.127.255.255', '224.0.0.1', '240.0.0.1', '255.255.255.255', '0.0.0.0']) {
      expect(isBlockedAddress(address, 4), address).toBe(true);
    }
  });

  it('allows ordinary public addresses', () => {
    for (const address of ['1.1.1.1', '8.8.8.8', '93.184.216.34', '100.63.255.255', '100.128.0.1']) {
      expect(isBlockedAddress(address, 4), address).toBe(false);
    }
  });

  it('refuses anything it cannot parse rather than guessing', () => {
    // Octal-looking octets are the classic bypass: some resolvers read
    // 0177.0.0.1 as 127.0.0.1. Refusing unparseable input closes that.
    for (const address of ['0177.0.0.1', '2130706433', '1.2.3', '1.2.3.4.5', '999.1.1.1', '', 'localhost']) {
      expect(isBlockedAddress(address, 4), address).toBe(true);
    }
  });
});

describe('isBlockedAddress, IPv6', () => {
  it('blocks loopback, unspecified and link-local', () => {
    for (const address of ['::1', '::', 'fe80::1', 'FE80::abcd']) {
      expect(isBlockedAddress(address, 6), address).toBe(true);
    }
  });

  it('blocks unique-local and multicast', () => {
    for (const address of ['fc00::1', 'fd12:3456::1', 'ff02::1']) {
      expect(isBlockedAddress(address, 6), address).toBe(true);
    }
  });

  it('sees through IPv4-mapped forms', () => {
    // ::ffff:169.254.169.254 reaches the metadata service; judging it as a
    // v6 address that merely starts with colons would let it straight through.
    expect(isBlockedAddress('::ffff:127.0.0.1', 6)).toBe(true);
    expect(isBlockedAddress('::ffff:169.254.169.254', 6)).toBe(true);
    expect(isBlockedAddress('::ffff:10.0.0.1', 6)).toBe(true);
    expect(isBlockedAddress('::ffff:8.8.8.8', 6)).toBe(false);
  });

  it('blocks the transition ranges that carry a v4 address inside', () => {
    expect(isBlockedAddress('64:ff9b::7f00:1', 6)).toBe(true);
    expect(isBlockedAddress('2002:7f00:1::', 6)).toBe(true);
  });

  it('ignores a zone index rather than being confused by one', () => {
    expect(isBlockedAddress('fe80::1%eth0', 6)).toBe(true);
  });

  it('allows ordinary public addresses', () => {
    for (const address of ['2606:4700:4700::1111', '2a00:1450:4009:81f::200e']) {
      expect(isBlockedAddress(address, 6), address).toBe(false);
    }
  });
});
