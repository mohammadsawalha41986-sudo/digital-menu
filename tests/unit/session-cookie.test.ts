import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import { sessionCookieOptions } from '@/server/auth/session';

function withEnv(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  resetEnvCache();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

const PROD = {
  NODE_ENV: 'production',
  AUTH_SECRET: 'a-long-enough-production-secret-for-tests-only-0123456789',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
};

describe('session cookie', () => {
  it('is Secure in production on a real address', () => {
    withEnv({ ...PROD, APP_URL: 'https://menu.example.com' });
    expect(sessionCookieOptions().secure).toBe(true);
  });

  it('stays Secure in production even if the address is misconfigured as http', () => {
    withEnv({ ...PROD, APP_URL: 'http://menu.example.com' });
    expect(sessionCookieOptions().secure).toBe(true);
  });

  it('is not Secure for a production build served over http on this machine', () => {
    withEnv({ ...PROD, APP_URL: 'http://127.0.0.1:3100' });
    expect(sessionCookieOptions().secure).toBe(false);
  });
});
