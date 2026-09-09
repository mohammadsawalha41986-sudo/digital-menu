import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/lib/env';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
};

describe('environment validation', () => {
  it('applies development defaults for optional values', () => {
    const env = parseEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_URL).toBe('http://localhost:3000');
    expect(env.STORAGE_PROVIDER).toBe('local');
  });

  it('fails when the database URL is missing', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('fails when a URL is malformed', () => {
    expect(() => parseEnv({ ...base, APP_URL: 'not-a-url' })).toThrow(/APP_URL/);
  });

  it('requires a real AUTH_SECRET in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/AUTH_SECRET/);
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', AUTH_SECRET: 'dev-only-insecure-secret' }),
    ).toThrow(/AUTH_SECRET/);
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', AUTH_SECRET: 'a-real-generated-secret' }),
    ).not.toThrow();
  });

  it('requires complete configuration when R2 is selected', () => {
    expect(() => parseEnv({ ...base, STORAGE_PROVIDER: 'r2' })).toThrow(/STORAGE_BUCKET/);
    expect(() =>
      parseEnv({
        ...base,
        STORAGE_PROVIDER: 'r2',
        STORAGE_BUCKET: 'menus',
        STORAGE_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
        STORAGE_ACCESS_KEY: 'key',
        STORAGE_SECRET_KEY: 'secret',
      }),
    ).toThrow(/STORAGE_PUBLIC_BASE_URL/);
  });

  it('accepts a fully configured R2 provider', () => {
    expect(() =>
      parseEnv({
        ...base,
        STORAGE_PROVIDER: 'r2',
        STORAGE_BUCKET: 'menus',
        STORAGE_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
        STORAGE_ACCESS_KEY: 'key',
        STORAGE_SECRET_KEY: 'secret',
        STORAGE_PUBLIC_BASE_URL: 'https://media.example.com',
      }),
    ).not.toThrow();
  });

  it('rejects malformed R2 URLs at configuration time', () => {
    expect(() =>
      parseEnv({
        ...base,
        STORAGE_PROVIDER: 'r2',
        STORAGE_BUCKET: 'menus',
        STORAGE_ENDPOINT: 'not-a-url',
        STORAGE_ACCESS_KEY: 'key',
        STORAGE_SECRET_KEY: 'secret',
        STORAGE_PUBLIC_BASE_URL: 'https://media.example.com',
      }),
    ).toThrow(/STORAGE_ENDPOINT/);
  });

  it('rejects an unknown storage provider rather than silently defaulting', () => {
    expect(() => parseEnv({ ...base, STORAGE_PROVIDER: 'ftp' })).toThrow(/STORAGE_PROVIDER/);
  });

  it('names the offending keys without echoing their values', () => {
    const secret = 'super-secret-value-that-must-not-leak';
    try {
      parseEnv({ ...base, NODE_ENV: 'production', AUTH_SECRET: '', DATABASE_URL: secret });
      expect.unreachable('expected validation to fail');
    } catch (error) {
      expect(String(error)).toContain('AUTH_SECRET');
      expect(String(error)).not.toContain(secret);
    }
  });
});
