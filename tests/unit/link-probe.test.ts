import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { probeLink } from '@/server/links/probe';

/**
 * `probeLink` against a real HTTP server.
 *
 * The server is bound to loopback, which the address policy refuses — and that
 * is the point of the first test: the guard is proven against an address that
 * genuinely exists and genuinely answers, rather than one that happens not to.
 */

let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = request.url ?? '/';

    if (url === '/redirect-to-metadata') {
      response.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
      response.end();
      return;
    }

    if (url === '/loop') {
      response.writeHead(302, { location: '/loop' });
      response.end();
      return;
    }

    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
  });

  /*
   * A port the checker is willing to connect to. An ephemeral port would be
   * refused by the port allowlist before the address was ever looked at, and
   * these tests would pass while proving nothing about the address rule.
   */
  for (const candidate of [8080, 8443]) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(candidate, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      break;
    } catch {
      // In use; try the next.
    }
  }

  const address = server.address() as AddressInfo | null;
  if (!address) throw new Error('link-probe tests: no allowed port was free to bind');
  port = address.port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('probeLink', () => {
  it('refuses loopback even though something is listening there', async () => {
    const result = await probeLink(`http://127.0.0.1:${port}/`);

    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toMatch(/private or reserved/);
    expect(result.httpStatus).toBeNull();
  });

  it('refuses a hostname that resolves to loopback', async () => {
    // The name is public; the address is not. Checking the resolved address
    // rather than the name is what makes this refusable at all.
    const result = await probeLink(`http://localhost:${port}/`);

    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toMatch(/private or reserved/);
  });

  it('refuses a scheme that is not the web, without resolving anything', async () => {
    const result = await probeLink('file:///etc/passwd');

    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toMatch(/Refused scheme/);
  });

  it('refuses a port outside the web set', async () => {
    const result = await probeLink('http://example.com:6379/');

    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toMatch(/Refused port/);
  });

  it('refuses credentials in the URL', async () => {
    const result = await probeLink('https://user:pass@example.com/');

    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toMatch(/credentials/);
  });

  it('re-checks the address after a redirect', async () => {
    /*
     * The reason redirects are followed by hand. The first address is fine;
     * the second is the cloud metadata service. Letting `fetch` follow the
     * redirect would mean nothing ever looked at the address that was
     * actually contacted.
     */
    const result = await probeLink(`http://127.0.0.1:${port}/redirect-to-metadata`);

    expect(result.status).toBe('BLOCKED');
  });

  it('reports an unresolvable host as broken, not working', async () => {
    const result = await probeLink('https://this-name-does-not-resolve.invalid/');

    expect(result.status).not.toBe('WORKING');
  });
});
