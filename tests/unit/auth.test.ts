import { describe, expect, it, beforeEach } from 'vitest';
import {
  PasswordPolicyError,
  assertPasswordPolicy,
  generatePassword,
  hashPassword,
  verifyPassword,
} from '@/server/auth/password';
import {
  SESSION_TTL_SECONDS,
  createSessionToken,
  readSessionToken,
} from '@/server/auth/session';
import { resetEnvCache } from '@/lib/env';

beforeEach(() => {
  process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/db';
  process.env.AUTH_SECRET = 'test-secret-value-for-signing-sessions';
  resetEnvCache();
});

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('salts every hash, so identical passwords do not collide', async () => {
    const [a, b] = await Promise.all([hashPassword('same passphrase!'), hashPassword('same passphrase!')]);

    expect(a).not.toBe(b);
    expect(await verifyPassword('same passphrase!', a)).toBe(true);
    expect(await verifyPassword('same passphrase!', b)).toBe(true);
  });

  it('stores a self-describing format so parameters can be raised later', async () => {
    const hash = await hashPassword('a passphrase long enough');
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true);
  });

  it('returns false — never throws — for a missing or malformed hash', async () => {
    for (const stored of [null, '', 'garbage', 'scrypt$1$2$3', 'bcrypt$a$b$c$d$e']) {
      expect(await verifyPassword('anything', stored), String(stored)).toBe(false);
    }
  });

  it('enforces length rather than composition rules', () => {
    expect(() => assertPasswordPolicy('short')).toThrow(PasswordPolicyError);
    expect(() => assertPasswordPolicy('a'.repeat(257))).toThrow(PasswordPolicyError);
    expect(() => assertPasswordPolicy('a reasonable passphrase')).not.toThrow();
  });

  it('generates high-entropy provisioning passwords', () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(passwords.size).toBe(50);
    expect(generatePassword().length).toBeGreaterThanOrEqual(20);
  });
});

describe('session tokens', () => {
  it('round-trips the user id', () => {
    const token = createSessionToken('user_abc');
    expect(readSessionToken(token)?.userId).toBe('user_abc');
  });

  it('rejects a tampered payload', () => {
    const token = createSessionToken('user_abc');
    const [payload, signature] = token.split('.');

    const forged = Buffer.from(JSON.stringify({ userId: 'user_root', exp: 9e9 })).toString(
      'base64url',
    );

    expect(readSessionToken(`${forged}.${signature}`)).toBeNull();
    expect(readSessionToken(`${payload}.${'x'.repeat(43)}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const issued = Date.now();
    const token = createSessionToken('user_abc', issued);

    expect(readSessionToken(token, issued + 1000)).not.toBeNull();
    expect(readSessionToken(token, issued + (SESSION_TTL_SECONDS + 1) * 1000)).toBeNull();
  });

  it('rejects malformed input without throwing', () => {
    for (const input of [undefined, null, '', 'no-dot', 'a.b.c', '.', 'x.']) {
      expect(readSessionToken(input as string | undefined | null), String(input)).toBeNull();
    }
  });

  it('does not verify under a different signing secret', () => {
    const token = createSessionToken('user_abc');

    process.env.AUTH_SECRET = 'a-completely-different-secret-value';
    resetEnvCache();

    expect(readSessionToken(token)).toBeNull();
  });
});
