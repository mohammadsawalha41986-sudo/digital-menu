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
