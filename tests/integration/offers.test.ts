import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getPublicProfile } from '@/server/profile/repository';
import { upsertOffer } from '@/server/offers/service';
import { ValidationError } from '@/server/admin/business-service';
import { OfferWindowError } from '@/server/offers/scheduling';
import { TenantAccessError, type AuthenticatedUser } from '@/server/tenancy/context';

/**
 * Offers end to end: what the public profile actually serves, and — the part
 * that matters — what it stops serving on its own.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const PUBLIC_ID = 'PRM001';
let businessId = '';
let user: AuthenticatedUser = { id: '', role: 'STAFF' };
let outsider: AuthenticatedUser = { id: '', role: 'STAFF' };

const OWNER_EMAIL = 'offers-owner@example.test';
const OTHER_EMAIL = 'offers-other@example.test';

beforeAll(async () => {
  if (!databaseReachable) return;
  await cleanup();

  const business = await prisma.business.create({
    data: {
      publicId: PUBLIC_ID,
      slug: 'offer-fixture',
      type: 'RESTAURANT',
      status: 'ACTIVE',
      currency: 'SAR',
      nameAr: 'مطعم العروض',
      nameEn: 'Offer Fixture',
    },
  });

  businessId = business.id;

  const [owner, other] = await Promise.all([
    prisma.user.create({ data: { email: OWNER_EMAIL, name: 'Owner', role: 'STAFF' } }),
    prisma.user.create({ data: { email: OTHER_EMAIL, name: 'Other', role: 'STAFF' } }),
  ]);

  user = { id: owner.id, role: 'STAFF' };
  outsider = { id: other.id, role: 'STAFF' };

  await prisma.businessMembership.create({
    data: { userId: owner.id, businessId, role: 'OWNER' },
  });
});

afterAll(async () => {
  if (databaseReachable) await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  await prisma.business.deleteMany({ where: { publicId: PUBLIC_ID } });
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
}

const base = {
  titleAr: 'عرض',
  titleEn: 'Offer',
  placement: 'FEATURED' as const,
  isActive: true,
};

describe.skipIf(!databaseReachable)('offers on the public profile', () => {
  it('serves a live offer with a computed discount', async () => {
    await upsertOffer(user, businessId, {
      ...base,
      key: 'live-offer',
      originalPrice: '100',
      offerPrice: '75',
    });

    const profile = await getPublicProfile(PUBLIC_ID);
    const offer = profile?.offers.find((entry) => entry.key === 'live-offer');

    expect(offer).toBeDefined();
    expect(offer?.originalPriceMinor).toBe(10000);
    expect(offer?.offerPriceMinor).toBe(7500);
    expect(offer?.discountPercent).toBe(25);
    expect(offer?.currency).toBe('SAR');
  });

  it('never serves an expired offer', async () => {
    await upsertOffer(user, businessId, {
      ...base,
      key: 'expired-offer',
      startsAt: new Date('2020-01-01T00:00:00Z'),
      endsAt: new Date('2020-02-01T00:00:00Z'),
    });

    const profile = await getPublicProfile(PUBLIC_ID);

    // The row exists and is enabled — it is the window that excludes it, with
    // no job involved (master spec §42).
    const row = await prisma.offer.findFirstOrThrow({
      where: { businessId, key: 'expired-offer' },
    });
    expect(row.isActive).toBe(true);
    expect(profile?.offers.find((entry) => entry.key === 'expired-offer')).toBeUndefined();
  });

  it('never serves an offer scheduled for the future', async () => {
    await upsertOffer(user, businessId, {
      ...base,
      key: 'future-offer',
      startsAt: new Date(Date.now() + 86_400_000),
    });

    const profile = await getPublicProfile(PUBLIC_ID);
    expect(profile?.offers.find((entry) => entry.key === 'future-offer')).toBeUndefined();
  });

  it('never serves a disabled offer', async () => {
    await upsertOffer(user, businessId, { ...base, key: 'off-offer', isActive: false });

    const profile = await getPublicProfile(PUBLIC_ID);
    expect(profile?.offers.find((entry) => entry.key === 'off-offer')).toBeUndefined();
  });

  it('starts serving an offer the moment its window opens', async () => {
    const offer = await upsertOffer(user, businessId, {
      ...base,
      key: 'boundary-offer',
      startsAt: new Date(Date.now() + 60_000),
    });

    expect((await getPublicProfile(PUBLIC_ID))?.offers.map((entry) => entry.key)).not.toContain(
      'boundary-offer',
    );

    // Move the window open; nothing else changes.
    await prisma.offer.update({
      where: { id: offer.id },
      data: { startsAt: new Date(Date.now() - 60_000) },
    });

    expect((await getPublicProfile(PUBLIC_ID))?.offers.map((entry) => entry.key)).toContain(
      'boundary-offer',
    );
  });
});

describe.skipIf(!databaseReachable)('offer validation', () => {
  it('refuses a price it cannot read rather than guessing', async () => {
    await expect(
      upsertOffer(user, businessId, { ...base, key: 'bad-price', offerPrice: 'half off' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses an offer price that is not actually lower', async () => {
    await expect(
      upsertOffer(user, businessId, {
        ...base,
        key: 'not-a-discount',
        originalPrice: '50',
        offerPrice: '60',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a window that ends before it starts', async () => {
    await expect(
      upsertOffer(user, businessId, {
        ...base,
        key: 'impossible',
        startsAt: new Date('2026-07-01T00:00:00Z'),
        endsAt: new Date('2026-06-01T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(OfferWindowError);
  });

  it('refuses a write from a user with no grant', async () => {
    await expect(
      upsertOffer(outsider, businessId, { ...base, key: 'hijack' }),
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});
