import { describe, expect, it } from 'vitest';
import {
  OfferWindowError,
  assertValidWindow,
  discountPercent,
  isOfferLive,
  liveOfferWhere,
  offerState,
} from '@/server/offers/scheduling';
import { parseLocalDateTime } from '@/server/offers/datetime';

const NOON = new Date('2026-06-15T12:00:00.000Z');

describe('offer scheduling', () => {
  it('is live inside its window', () => {
    expect(
      offerState(
        {
          isActive: true,
          startsAt: new Date('2026-06-01T00:00:00Z'),
          endsAt: new Date('2026-07-01T00:00:00Z'),
        },
        NOON,
      ),
    ).toBe('live');
  });

  it('is scheduled before it starts', () => {
    expect(
      offerState(
        { isActive: true, startsAt: new Date('2026-07-01T00:00:00Z'), endsAt: null },
        NOON,
      ),
    ).toBe('scheduled');
  });

  it('expires without any job having to run (master spec §42)', () => {
    // The point of computing at read time: nothing has to fire for this to
    // stop appearing on a customer's menu.
    expect(
      offerState(
        { isActive: true, startsAt: null, endsAt: new Date('2026-06-01T00:00:00Z') },
        NOON,
      ),
    ).toBe('expired');
  });

  it('treats the end bound as exclusive', () => {
    const endsAt = new Date('2026-06-15T12:00:00.000Z');

    expect(offerState({ isActive: true, startsAt: null, endsAt }, NOON)).toBe('expired');
    expect(
      offerState({ isActive: true, startsAt: null, endsAt }, new Date(NOON.getTime() - 1)),
    ).toBe('live');
  });

  it('runs indefinitely with no bounds', () => {
    expect(isOfferLive({ isActive: true, startsAt: null, endsAt: null }, NOON)).toBe(true);
  });

  it('reports a disabled offer as disabled regardless of window', () => {
    expect(
      offerState(
        {
          isActive: false,
          startsAt: new Date('2026-06-01T00:00:00Z'),
          endsAt: new Date('2026-07-01T00:00:00Z'),
        },
        NOON,
      ),
    ).toBe('disabled');
  });

  it('exposes a query predicate that matches the in-memory rule', () => {
    const where = liveOfferWhere(NOON);

    expect(where.isActive).toBe(true);
    expect(where.AND).toHaveLength(2);
    // The end bound uses `gt`, mirroring the exclusive comparison above; if
    // these two drifted apart a query could select an offer the renderer
    // considers expired.
    expect(JSON.stringify(where)).toContain('"gt"');
    expect(JSON.stringify(where)).toContain('"lte"');
  });

  it('rejects a window that could never be live', () => {
    expect(() =>
      assertValidWindow(new Date('2026-07-01T00:00:00Z'), new Date('2026-06-01T00:00:00Z')),
    ).toThrow(OfferWindowError);

    expect(() => assertValidWindow(null, new Date('2026-06-01T00:00:00Z'))).not.toThrow();
  });
});

describe('discount calculation', () => {
  it('computes a percentage from the two prices', () => {
    expect(discountPercent(10000, 7500, null)).toBe(25);
    expect(discountPercent(4200, 3360, null)).toBe(20);
  });

  it('prefers a stated percentage when one is given', () => {
    expect(discountPercent(10000, 7500, 30)).toBe(30);
  });

  it('returns null rather than inventing a discount', () => {
    // A displayed discount must be arithmetic, not marketing (GOALS I9).
    expect(discountPercent(null, 7500, null)).toBeNull();
    expect(discountPercent(10000, null, null)).toBeNull();
    expect(discountPercent(7500, 10000, null)).toBeNull();
    expect(discountPercent(10000, 10000, null)).toBeNull();
    expect(discountPercent(0, 0, null)).toBeNull();
    expect(discountPercent(10000, 7500, 0)).toBe(25);
    expect(discountPercent(null, null, 150)).toBeNull();
  });
});

describe('timezone-aware scheduling input', () => {
  it('reads a wall-clock time in the business timezone, not the server one', () => {
    // 23:00 in Riyadh (UTC+3) is 20:00 UTC.
    const parsed = parseLocalDateTime('2026-06-15T23:00', 'Asia/Riyadh');
    expect(parsed?.toISOString()).toBe('2026-06-15T20:00:00.000Z');
  });

  it('handles a zone with daylight saving correctly on both sides', () => {
    // London is UTC+1 in June and UTC+0 in January.
    expect(parseLocalDateTime('2026-06-15T12:00', 'Europe/London')?.toISOString()).toBe(
      '2026-06-15T11:00:00.000Z',
    );
    expect(parseLocalDateTime('2026-01-15T12:00', 'Europe/London')?.toISOString()).toBe(
      '2026-01-15T12:00:00.000Z',
    );
  });

  it('returns null for empty or malformed input', () => {
    expect(parseLocalDateTime(null, 'Asia/Riyadh')).toBeNull();
    expect(parseLocalDateTime('', 'Asia/Riyadh')).toBeNull();
    expect(parseLocalDateTime('tomorrow', 'Asia/Riyadh')).toBeNull();
  });

  it('falls back to UTC for an unknown zone rather than shifting silently', () => {
    expect(parseLocalDateTime('2026-06-15T12:00', 'Mars/Olympus')?.toISOString()).toBe(
      '2026-06-15T12:00:00.000Z',
    );
  });
});
