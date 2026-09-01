import { describe, expect, it } from 'vitest';
import { hashSecret, issueToken, parseToken, secretMatches } from '@/server/review/tokens';

describe('preview link tokens', () => {
  it('issues a token whose two halves round-trip through the URL form', () => {
    const issued = issueToken();
    const parsed = parseToken(issued.token);

    expect(parsed).toEqual({ key: issued.key, secret: issued.secret });
  });

  it('stores only a hash, never the secret', () => {
    const issued = issueToken();

    expect(issued.tokenHash).not.toContain(issued.secret);
    expect(issued.tokenHash).toHaveLength(64);
    expect(issued.tokenHash).toBe(hashSecret(issued.secret));
  });

  it('accepts the right secret and rejects a wrong one', () => {
    const issued = issueToken();

    expect(secretMatches(issued.secret, issued.tokenHash)).toBe(true);
    expect(secretMatches(issueToken().secret, issued.tokenHash)).toBe(false);
  });

  it('is unguessable — no two tokens collide across many issues', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => issueToken().token));
    expect(tokens.size).toBe(500);
  });

  it('uses a secret long enough that guessing is arithmetic that does not finish', () => {
    // 20 bytes over a 32-character alphabet.
    expect(issueToken().secret.length).toBeGreaterThanOrEqual(20);
  });

  it('omits characters that are misread when a link is read aloud', () => {
    const sample = Array.from({ length: 50 }, () => issueToken().token).join('');
    expect(sample).not.toMatch(/[lo01]/);
  });

  it('refuses a malformed token rather than half-parsing it', () => {
    expect(parseToken('no-dot-here')).toBeNull();
    expect(parseToken('too.many.parts')).toBeNull();
    expect(parseToken('.empty')).toBeNull();
    expect(parseToken('empty.')).toBeNull();
    expect(parseToken('UPPER.case')).toBeNull();
    expect(parseToken('has.sp aces')).toBeNull();
    expect(parseToken('')).toBeNull();
  });

  it('rejects a hash of the wrong length without throwing', () => {
    expect(secretMatches('anything', 'short')).toBe(false);
  });
});
