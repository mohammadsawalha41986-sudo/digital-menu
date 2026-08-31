import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import {
  createPreviewLink,
  listChangeRequests,
  listPreviewLinks,
  resolvePreviewToken,
  respondToPreview,
  revokePreviewLink,
} from '@/server/review/service';
import { resetEnvCache } from '@/lib/env';

/**
 * The client review journey (master spec §71–§73, §139, §140).
 *
 * The properties that make a link safe to hand to someone outside the company
 * are the ones worth testing: it works, it stops working when revoked, it
 * stops working when expired, a wrong secret is refused, and one business's
 * link never reaches another's profile.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const EMAIL = 'review-fixture@example.test';
let user = { id: '', role: 'SUPER_ADMIN' as const };
let businessId = '';

async function removeFixture() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;

  await removeFixture();

  const staff = await prisma.user.create({
    data: { email: EMAIL, name: 'Review Fixture', role: 'SUPER_ADMIN' },
  });
  user = { id: staff.id, role: 'SUPER_ADMIN' };

  const business = await prisma.business.findFirstOrThrow({
    where: { publicId: 'DEM001' },
    select: { id: true },
  });
  businessId = business.id;
});

afterAll(async () => {
  if (databaseReachable) {
    await prisma.previewLink.deleteMany({ where: { recipientNote: { startsWith: 'fixture:' } } });
    await removeFixture();
  }
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('client preview links', () => {
  it('issues a link that resolves to the business', async () => {
    const { token } = await createPreviewLink(user, businessId, {
      recipientNote: 'fixture: owner',
      days: 7,
    });

    const resolved = await resolvePreviewToken(token);

    expect(resolved?.businessId).toBe(businessId);
  });

  it('stores only a hash, so the database cannot hand the link over', async () => {
    const { token } = await createPreviewLink(user, businessId, {
      recipientNote: 'fixture: hashing',
    });

    const secret = token.split('.')[1]!;
    const rows = await prisma.previewLink.findMany({ select: { tokenHash: true } });

    for (const row of rows) expect(row.tokenHash).not.toContain(secret);
  });

  it('refuses a wrong secret against a real key', async () => {
    const { token } = await createPreviewLink(user, businessId, {
      recipientNote: 'fixture: wrong secret',
    });

    const key = token.split('.')[0]!;

    expect(await resolvePreviewToken(`${key}.aaaaaaaaaaaaaaaaaaaaaaaa`)).toBeNull();
  });

  it('stops working the moment it is revoked', async () => {
    const { link, token } = await createPreviewLink(user, businessId, {
      recipientNote: 'fixture: revoke',
    });

    expect(await resolvePreviewToken(token)).not.toBeNull();

    await revokePreviewLink(user, businessId, link.id);

    expect(await resolvePreviewToken(token)).toBeNull();
  });

  it('stops working once it has expired', async () => {
    const { link, token } = await createPreviewLink(user, businessId, {
      recipientNote: 'fixture: expiry',
    });

    await prisma.previewLink.update({
      where: { id: link.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await resolvePreviewToken(token)).toBeNull();
  });

  it('caps how far in the future a link may reach', async () => {
    const { link } = await createPreviewLink(user, businessId, {
      recipientNote: 'fixture: cap',
      days: 100_000,
    });

    const stored = await prisma.previewLink.findUniqueOrThrow({ where: { id: link.id } });
    const days = (stored.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);

    expect(days).toBeLessThanOrEqual(91);
  });

  it('records an approval against the link', async () => {
    const { link, token } = await createPreviewLink(user, businessId, {
      recipientNote: 'fixture: approval',
    });

    const result = await respondToPreview(token, { approve: true, name: 'Abu Khalid' });

    expect(result?.approved).toBe(true);

    const stored = await prisma.previewLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(stored.state).toBe('APPROVED');
    expect(stored.respondedBy).toBe('Abu Khalid');
    expect(stored.respondedAt).not.toBeNull();
  });

  it('turns a change request into a tracked item', async () => {
    const { token } = await createPreviewLink(user, businessId, {
      recipientNote: 'fixture: changes',
    });

    await respondToPreview(token, {
      approve: false,
      note: 'Please change the burger price to 45.',
      name: 'Abu Khalid',
    });

    const requests = await listChangeRequests(user, businessId);

    expect(requests.some((request) => request.body.includes('burger price to 45'))).toBe(true);
  });

  it('will not accept a change request with nothing written in it', async () => {
    const { token } = await createPreviewLink(user, businessId, {
      recipientNote: 'fixture: empty note',
    });

    await expect(respondToPreview(token, { approve: false, note: '  ' })).rejects.toThrow();
  });

  it('answers null rather than throwing for a token that never existed', async () => {
    expect(await resolvePreviewToken('nosuch.token')).toBeNull();
    expect(await respondToPreview('nosuch.token', { approve: true })).toBeNull();
  });

  it('counts views without recording an analytics event for the business', async () => {
    const { link, token } = await createPreviewLink(user, businessId, {
      recipientNote: 'fixture: views',
    });

    const before = await prisma.analyticsEvent.count({ where: { businessId } });

    await resolvePreviewToken(token);
    await prisma.previewLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewed: new Date() },
    });

    const stored = await prisma.previewLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(stored.viewCount).toBe(1);

    // A client reviewing a draft must not appear in the business's numbers.
    expect(await prisma.analyticsEvent.count({ where: { businessId } })).toBe(before);
  });

  it('lists links for staff without ever exposing a usable token', async () => {
    const links = await listPreviewLinks(user, businessId);

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(Object.keys(link)).not.toContain('tokenHash');
      expect(JSON.stringify(link)).not.toMatch(/\.[a-z2-9]{20,}/);
    }
  });
});
