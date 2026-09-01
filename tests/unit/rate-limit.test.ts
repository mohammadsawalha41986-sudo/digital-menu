import { beforeEach, describe, expect, it } from 'vitest';
import { RULES, clearAll, clientIdentity, consume, reset } from '@/server/security/rate-limit';

const RULE = { namespace: 'test', windowMs: 60_000, max: 3 } as const;

describe('rate limiting', () => {
  beforeEach(() => clearAll());

  it('permits exactly `max` attempts inside a window', () => {
    expect(consume(RULE, 'a').limited).toBe(false);
    expect(consume(RULE, 'a').limited).toBe(false);
    expect(consume(RULE, 'a').limited).toBe(false);
    expect(consume(RULE, 'a').limited).toBe(true);
  });

  it('reports remaining attempts, and zero once limited', () => {
    expect(consume(RULE, 'b').remaining).toBe(2);
    expect(consume(RULE, 'b').remaining).toBe(1);
    expect(consume(RULE, 'b').remaining).toBe(0);
    expect(consume(RULE, 'b').remaining).toBe(0);
  });

  it('keeps identities apart', () => {
    consume(RULE, 'c');
    consume(RULE, 'c');
    consume(RULE, 'c');
    expect(consume(RULE, 'c').limited).toBe(true);
    expect(consume(RULE, 'd').limited).toBe(false);
  });

  it('keeps namespaces apart, so one surface cannot exhaust another', () => {
    const other = { ...RULE, namespace: 'other' };
    consume(RULE, 'e');
    consume(RULE, 'e');
    consume(RULE, 'e');
    expect(consume(RULE, 'e').limited).toBe(true);
    expect(consume(other, 'e').limited).toBe(false);
  });

  it('forgets an identity on reset, which is what a correct password does', () => {
    consume(RULE, 'f');
    consume(RULE, 'f');
    consume(RULE, 'f');
    expect(consume(RULE, 'f').limited).toBe(true);

    reset(RULE, 'f');
    expect(consume(RULE, 'f').limited).toBe(false);
  });

  it('starts a fresh window once the old one has elapsed', () => {
    const brief = { namespace: 'brief', windowMs: 1, max: 1 } as const;
    expect(consume(brief, 'g').limited).toBe(false);
    expect(consume(brief, 'g').limited).toBe(true);

    const later = Date.now() + 5;
    while (Date.now() < later) {
      /* spin briefly rather than mock the clock */
    }

    expect(consume(brief, 'g').limited).toBe(false);
  });

  describe('client identity', () => {
    it('takes the first forwarded hop, because later ones are caller-supplied', () => {
      const request = new Request('https://example.test', {
        headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' },
      });

      expect(clientIdentity(request)).toBe('203.0.113.7');
    });

    it('falls back to x-real-ip', () => {
      const request = new Request('https://example.test', {
        headers: { 'x-real-ip': '198.51.100.4' },
      });

      expect(clientIdentity(request)).toBe('198.51.100.4');
    });

    it('collapses unidentifiable callers into one strict bucket', () => {
      expect(clientIdentity(new Request('https://example.test'))).toBe('unknown');
    });
  });

  describe('declared rules', () => {
    it('throttles password guessing far harder than analytics beacons', () => {
      expect(RULES.loginAccount.max).toBeLessThan(RULES.events.max);
      expect(RULES.loginAccount.windowMs).toBeGreaterThan(RULES.events.windowMs);
    });

    it('lets a client try more addresses than any single account allows', () => {
      expect(RULES.loginClient.max).toBeGreaterThan(RULES.loginAccount.max);
    });
  });
});

describe('client identity from bare headers', () => {
  it('reads a Headers object the same way it reads a Request', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });
    const request = new Request('https://example.test', { headers });

    // A server component has only Headers; a route handler has the Request.
    expect(clientIdentity(headers)).toBe('203.0.113.9');
    expect(clientIdentity(request)).toBe(clientIdentity(headers));
  });

  it('falls back to the strict shared bucket for bare headers too', () => {
    expect(clientIdentity(new Headers())).toBe('unknown');
  });
});

describe('what the login limiter is counting', () => {
  beforeEach(() => clearAll());

  it('a successful sign-in must clear both windows, not just the account one', () => {
    // The client window is shared by everyone behind one address. If successes
    // counted against it, a restaurant group's staff would lock each other out
    // of their own admin after twenty-five ordinary sign-ins.
    const account = 'staff@example.test';
    const client = '203.0.113.10';

    for (let attempt = 0; attempt < RULES.loginClient.max; attempt += 1) {
      expect(consume(RULES.loginClient, client).limited).toBe(false);
      // …each one succeeding, which is what a busy morning looks like.
      reset(RULES.loginAccount, account);
      reset(RULES.loginClient, client);
    }

    expect(consume(RULES.loginClient, client).limited).toBe(false);
  });

  it('still stops a run of failures from one client', () => {
    const client = '198.51.100.20';

    for (let attempt = 0; attempt < RULES.loginClient.max; attempt += 1) {
      expect(consume(RULES.loginClient, client).limited).toBe(false);
    }

    // No reset, because none of those succeeded.
    expect(consume(RULES.loginClient, client).limited).toBe(true);
  });

  it('still stops a run of failures against one account', () => {
    const account = 'target@example.test';

    for (let attempt = 0; attempt < RULES.loginAccount.max; attempt += 1) {
      expect(consume(RULES.loginAccount, account).limited).toBe(false);
    }

    expect(consume(RULES.loginAccount, account).limited).toBe(true);
  });
});
