import { beforeEach, describe, expect, it } from 'vitest';
import { clientIp, deviceCategory, visitorHash } from '@/server/analytics/privacy';
import { isEventType, looksLikeQrScan } from '@/server/analytics/record';
import { rangeStart } from '@/server/analytics/report';
import { resetEnvCache } from '@/lib/env';

beforeEach(() => {
  process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/db';
  process.env.ANALYTICS_SALT = 'a-test-analytics-salt';
  resetEnvCache();
});

const base = {
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0 (iPhone)',
  businessId: 'biz_a',
  now: new Date('2026-06-15T10:00:00Z'),
};

describe('visitor hashing (master spec §113)', () => {
  it('is stable within a day for the same visitor and business', () => {
    const morning = visitorHash(base);
    const evening = visitorHash({ ...base, now: new Date('2026-06-15T22:00:00Z') });

    expect(morning).toBe(evening);
  });

  it('rotates at the day boundary, so visits cannot be joined into a history', () => {
    const today = visitorHash(base);
    const tomorrow = visitorHash({ ...base, now: new Date('2026-06-16T10:00:00Z') });

    expect(today).not.toBe(tomorrow);
  });

  it('differs per business, so nothing correlates across tenants', () => {
    expect(visitorHash(base)).not.toBe(visitorHash({ ...base, businessId: 'biz_b' }));
  });

  it('never contains the address it was derived from', () => {
    const hash = visitorHash(base) ?? '';

    expect(hash).not.toContain('203.0.113.7');
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('counts anonymously rather than using a predictable hash when no secret is set', () => {
    delete process.env.ANALYTICS_SALT;
    delete process.env.AUTH_SECRET;
    resetEnvCache();

    expect(visitorHash(base)).toBeNull();
  });
});

describe('device classification', () => {
  it('buckets the three classes the reporting needs', () => {
    expect(deviceCategory('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148')).toBe('MOBILE');
    expect(deviceCategory('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('TABLET');
    expect(deviceCategory('Mozilla/5.0 (Macintosh) Chrome/120')).toBe('DESKTOP');
    expect(deviceCategory(null)).toBe('UNKNOWN');
    expect(deviceCategory('curl/8.0')).toBe('UNKNOWN');
  });

  it('does not mistake an Android tablet for a phone', () => {
    expect(deviceCategory('Mozilla/5.0 (Linux; Android 14; SM-X200) Chrome/120 Safari/537')).toBe(
      'TABLET',
    );
    expect(
      deviceCategory('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Chrome/120 Safari/537'),
    ).toBe('MOBILE');
  });
});

describe('event types', () => {
  it('accepts only known event names', () => {
    expect(isEventType('profile_view')).toBe(true);
    expect(isEventType('contact_whatsapp')).toBe(true);
    expect(isEventType('drop table events')).toBe(false);
    expect(isEventType('')).toBe(false);
  });
});

describe('scan detection', () => {
  it('treats a referrer-less first-party navigation as a likely scan', () => {
    expect(looksLikeQrScan(new Headers())).toBe(true);
    expect(looksLikeQrScan(new Headers({ 'sec-fetch-site': 'none' }))).toBe(true);
  });

  it('does not count an in-site navigation as a scan', () => {
    expect(looksLikeQrScan(new Headers({ referer: 'https://menu.example.com/m/DEM001' }))).toBe(
      false,
    );
    expect(looksLikeQrScan(new Headers({ 'sec-fetch-site': 'same-origin' }))).toBe(false);
  });
});

describe('client address extraction', () => {
  it('takes the first hop from x-forwarded-for', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe(
      '203.0.113.7',
    );
  });

  it('falls back through the other proxy headers', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe('report ranges', () => {
  const now = new Date('2026-06-15T13:45:00Z');

  it('starts "today" at midnight UTC', () => {
    expect(rangeStart('today', now)?.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('computes rolling windows', () => {
    expect(rangeStart('7d', now)?.toISOString()).toBe('2026-06-08T13:45:00.000Z');
    expect(rangeStart('30d', now)?.toISOString()).toBe('2026-05-16T13:45:00.000Z');
  });

  it('has no lower bound for all time', () => {
    expect(rangeStart('all', now)).toBeNull();
  });
});
