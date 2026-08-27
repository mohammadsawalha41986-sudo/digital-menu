import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { recordEvent, recordEventByPublicId } from '@/server/analytics/record';
import { buildReport } from '@/server/analytics/report';
import { resetEnvCache } from '@/lib/env';
import { TenantAccessError, type AuthenticatedUser } from '@/server/tenancy/context';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

const PUBLIC_ID = 'ANA001';
const DRAFT_ID = 'ANA002';
let businessId = '';
let user: AuthenticatedUser = { id: '', role: 'STAFF' };
let outsider: AuthenticatedUser = { id: '', role: 'STAFF' };

const OWNER_EMAIL = 'analytics-owner@example.test';
const OTHER_EMAIL = 'analytics-other@example.test';

const headers = new Headers({
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148',
  'x-forwarded-for': '203.0.113.9',
});

beforeAll(async () => {
  process.env.ANALYTICS_SALT = 'integration-analytics-salt';
  resetEnvCache();

  if (!databaseReachable) return;
  await cleanup();

  const business = await prisma.business.create({
    data: {
      publicId: PUBLIC_ID,
      slug: 'analytics-fixture',
      type: 'CAFE',
      status: 'ACTIVE',
      nameAr: 'مقهى التحليلات',
      nameEn: 'Analytics Fixture',
    },
  });

  businessId = business.id;

  await prisma.business.create({
    data: {
      publicId: DRAFT_ID,
      slug: 'analytics-draft',
      type: 'CAFE',
      status: 'DRAFT',
      nameAr: 'مسودة',
    },
  });

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
  await prisma.business.deleteMany({ where: { publicId: { in: [PUBLIC_ID, DRAFT_ID] } } });
  await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, OTHER_EMAIL] } } });
}

describe.skipIf(!databaseReachable)('event recording', () => {
  it('records an event with no personal data', async () => {
    await recordEvent({
      businessId,
      eventType: 'profile_view',
      locale: 'ar',
      headers,
    });

    const event = await prisma.analyticsEvent.findFirstOrThrow({
      where: { businessId, eventType: 'profile_view' },
    });

    expect(event.device).toBe('MOBILE');
    expect(event.locale).toBe('ar');
    expect(event.visitorHash).toMatch(/^[0-9a-f]{32}$/);

    // The row carries no address and no user agent (master spec §113).
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('203.0.113.9');
    expect(serialized).not.toContain('iPhone');
  });

  it('records interaction events with public keys only', async () => {
    await recordEvent({
      businessId,
      eventType: 'item_view',
      targetKey: 'MN-001',
      headers,
    });

    const event = await prisma.analyticsEvent.findFirstOrThrow({
      where: { businessId, eventType: 'item_view' },
    });

    expect(event.targetKey).toBe('MN-001');
    // The target is a public key. The row's own id and businessId are
    // internal by design; what must never appear here is an internal id
    // *as the target*, since that is what reporting surfaces.
    expect(event.targetKey).not.toMatch(/^c[a-z0-9]{24}$/);
  });

  it('never throws at the caller when a write fails', async () => {
    // A bad business id is a foreign-key violation; the visitor must not see it.
    await expect(
      recordEvent({ businessId: 'does-not-exist', eventType: 'profile_view', headers }),
    ).resolves.toBeUndefined();
  });

  it('resolves a public id and ignores an inactive business', async () => {
    await recordEventByPublicId({ publicId: PUBLIC_ID, eventType: 'qr_scan', headers });
    await recordEventByPublicId({ publicId: DRAFT_ID, eventType: 'qr_scan', headers });
    await recordEventByPublicId({ publicId: 'ZZZZZZ', eventType: 'qr_scan', headers });

    // Scoped to this fixture: other suites and E2E runs share the database and
    // legitimately record scans of their own.
    const scans = await prisma.analyticsEvent.count({
      where: { businessId, eventType: 'qr_scan' },
    });
    expect(scans).toBe(1);

    // The draft and the unknown id wrote nothing anywhere.
    const draft = await prisma.business.findUniqueOrThrow({ where: { publicId: DRAFT_ID } });
    expect(await prisma.analyticsEvent.count({ where: { businessId: draft.id } })).toBe(0);
  });
});

describe.skipIf(!databaseReachable)('reporting', () => {
  it('counts only what was recorded', async () => {
    const report = await buildReport(user, businessId, 'all');

    expect(report.profileViews).toBe(1);
    expect(report.qrScans).toBe(1);
    expect(report.uniqueVisitors).toBe(1);
    expect(report.topItems[0]).toEqual({ key: 'MN-001', count: 1 });
    expect(report.empty).toBe(false);
  });

  it('counts repeat visits from one visitor as one unique in a day', async () => {
    for (let i = 0; i < 3; i += 1) {
      await recordEvent({ businessId, eventType: 'profile_view', headers });
    }

    const report = await buildReport(user, businessId, 'today');
    expect(report.profileViews).toBe(4);
    expect(report.uniqueVisitors).toBe(1);
  });

  it('distinguishes separate visitors', async () => {
    await recordEvent({
      businessId,
      eventType: 'profile_view',
      headers: new Headers({ 'user-agent': 'Chrome', 'x-forwarded-for': '198.51.100.22' }),
    });

    const report = await buildReport(user, businessId, 'today');
    expect(report.uniqueVisitors).toBe(2);
  });

  it('reports an empty period plainly rather than as zeroes with no context', async () => {
    // Everything above was recorded now, so a look at "today" for a business
    // with nothing recorded must say so.
    const otherBusiness = await prisma.business.create({
      data: { publicId: 'ANA003', slug: 'analytics-quiet', nameAr: 'هادئ' },
    });

    await prisma.businessMembership.create({
      data: { userId: user.id, businessId: otherBusiness.id, role: 'OWNER' },
    });

    const report = await buildReport(user, otherBusiness.id, 'all');
    expect(report.empty).toBe(true);
    expect(report.totalEvents).toBe(0);

    await prisma.business.delete({ where: { id: otherBusiness.id } });
  });

  it('refuses a report for a business the user has no grant for', async () => {
    await expect(buildReport(outsider, businessId, 'all')).rejects.toBeInstanceOf(
      TenantAccessError,
    );
  });
});
