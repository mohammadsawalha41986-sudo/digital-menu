import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import {
  ApiAuthError,
  assertBusinessInScope,
  authenticateApiRequest,
  generateApiToken,
  hashToken,
  scopeFilter,
} from '@/server/api/auth';
import { buildMeta, parseListQuery } from '@/server/api/response';

/**
 * API authentication and scoping.
 *
 * The properties that matter here are the same two as everywhere else: a key
 * cannot read outside its scope, and no failure mode tells an attacker
 * anything they did not already know.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await prisma
  .$queryRaw`SELECT 1`
  .then(() => true)
  .catch(() => false);

let scopedToken = '';
let platformToken = '';
let revokedToken = '';
let expiredToken = '';
let alphaId = '';
let betaId = '';

beforeAll(async () => {
  if (!databaseReachable) return;
  await cleanup();

  const [alpha, beta] = await Promise.all([
    prisma.business.create({
      data: { publicId: 'APX001', slug: 'api-alpha', nameAr: 'ألفا', status: 'ACTIVE' },
    }),
    prisma.business.create({
      data: { publicId: 'APX002', slug: 'api-beta', nameAr: 'بيتا', status: 'ACTIVE' },
    }),
  ]);

  alphaId = alpha.id;
  betaId = beta.id;

  const scoped = generateApiToken();
  scopedToken = scoped.token;
  await prisma.apiClient.create({
    data: {
      name: 'Scoped key',
      tokenPrefix: scoped.prefix,
      tokenHash: scoped.hash,
      businessIds: [alphaId],
      marketingClientId: 'marketing-client-1',
    },
  });

  const platform = generateApiToken();
  platformToken = platform.token;
  await prisma.apiClient.create({
    data: { name: 'Platform key', tokenPrefix: platform.prefix, tokenHash: platform.hash },
  });

  const revoked = generateApiToken();
  revokedToken = revoked.token;
  await prisma.apiClient.create({
    data: {
      name: 'Revoked key',
      tokenPrefix: revoked.prefix,
      tokenHash: revoked.hash,
      isActive: false,
    },
  });

  const expired = generateApiToken();
  expiredToken = expired.token;
  await prisma.apiClient.create({
    data: {
      name: 'Expired key',
      tokenPrefix: expired.prefix,
      tokenHash: expired.hash,
      expiresAt: new Date('2020-01-01T00:00:00Z'),
    },
  });
});

afterAll(async () => {
  if (databaseReachable) await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  await prisma.business.deleteMany({ where: { publicId: { in: ['APX001', 'APX002'] } } });
  await prisma.apiClient.deleteMany({
    where: { name: { in: ['Scoped key', 'Platform key', 'Revoked key', 'Expired key'] } },
  });
}

function request(token?: string) {
  return new Request('https://menu.example.com/api/v1/businesses', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('token issuance', () => {
  it('stores only a hash, never the token', () => {
    const issued = generateApiToken();

    // Hex only: the alphabet is disjoint from the `_` delimiter, so a token
    // can never be ambiguous to parse.
    expect(issued.token).toMatch(/^dpo_[0-9a-f]{8}_[0-9a-f]{64}$/);
    expect(issued.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.hash).not.toContain(issued.token);
    // The stored hash is derived from the whole token, prefix included.
    expect(hashToken(issued.token)).toBe(issued.hash);
  });

  it('issues unique tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateApiToken().token));
    expect(tokens.size).toBe(50);
  });
});

describe.skipIf(!databaseReachable)('authentication', () => {
  it('accepts a valid key', async () => {
    const credential = await authenticateApiRequest(request(scopedToken));

    expect(credential.name).toBe('Scoped key');
    expect(credential.businessIds).toEqual([alphaId]);
    expect(credential.marketingClientId).toBe('marketing-client-1');
  });

  it('rejects every failure mode with the same message', async () => {
    const attempts = [
      request(),
      request('not-a-token'),
      request('dpo_aaaaaaaa_wrong'),
      request(revokedToken),
      request(expiredToken),
      new Request('https://menu.example.com/api/v1/businesses', {
        headers: { authorization: scopedToken },
      }),
    ];

    for (const attempt of attempts) {
      const error = await authenticateApiRequest(attempt).catch((caught) => caught);
      expect(error).toBeInstanceOf(ApiAuthError);
      // One message for all of them: the endpoint is not a key oracle.
      expect((error as ApiAuthError).message).toBe('Authentication required');
      expect((error as ApiAuthError).status).toBe(401);
    }
  });

  it('rejects a token whose secret was tampered with', async () => {
    const [prefix, secret] = [scopedToken.split('_')[1], scopedToken.split('_')[2]];
    const forged = `dpo_${prefix}_${(secret ?? '').slice(0, -2)}xy`;

    await expect(authenticateApiRequest(request(forged))).rejects.toBeInstanceOf(ApiAuthError);
  });
});

describe.skipIf(!databaseReachable)('scoping', () => {
  it('restricts a scoped key to its allowlist', async () => {
    const credential = await authenticateApiRequest(request(scopedToken));

    expect(scopeFilter(credential)).toEqual({ id: { in: [alphaId] } });
    expect(() => assertBusinessInScope(credential, alphaId)).not.toThrow();
  });

  it('answers "not found" rather than "forbidden" for another business', async () => {
    const credential = await authenticateApiRequest(request(scopedToken));

    // 404, not 403: the API must not confirm that a business exists to a key
    // that cannot read it.
    const error = await Promise.resolve()
      .then(() => assertBusinessInScope(credential, betaId))
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiAuthError);
    expect((error as ApiAuthError).status).toBe(404);
  });

  it('lets a platform-wide key through unfiltered', async () => {
    const credential = await authenticateApiRequest(request(platformToken));

    expect(credential.businessIds).toEqual([]);
    expect(scopeFilter(credential)).toEqual({});
    expect(() => assertBusinessInScope(credential, betaId)).not.toThrow();
  });

  it('stamps last use without failing the request', async () => {
    await authenticateApiRequest(request(scopedToken));
    // The stamp is fire-and-forget; give it a moment, then confirm it landed.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const client = await prisma.apiClient.findFirstOrThrow({ where: { name: 'Scoped key' } });
    expect(client.lastUsedAt).not.toBeNull();
  });
});

describe('list query parsing', () => {
  const url = (query: string) => new Request(`https://menu.example.com/api/v1/businesses?${query}`);

  it('applies defaults', () => {
    const parsed = parseListQuery(url(''), ['createdAt', 'slug']);

    expect(parsed).toEqual({
      page: 1,
      perPage: 25,
      sort: 'createdAt',
      order: 'desc',
      search: null,
    });
  });

  it('caps the page size', () => {
    expect(parseListQuery(url('per_page=5000'), ['createdAt']).perPage).toBe(100);
    expect(parseListQuery(url('per_page=0'), ['createdAt']).perPage).toBe(1);
    expect(parseListQuery(url('per_page=abc'), ['createdAt']).perPage).toBe(25);
  });

  it('ignores a sort field that is not allowlisted', () => {
    // An unchecked field name reaches the query builder; that is how an
    // ordering parameter becomes an injection vector.
    const parsed = parseListQuery(url('sort=passwordHash'), ['createdAt', 'slug']);
    expect(parsed.sort).toBe('createdAt');

    expect(parseListQuery(url('sort=slug'), ['createdAt', 'slug']).sort).toBe('slug');
  });

  it('bounds the search term', () => {
    const parsed = parseListQuery(url(`search=${'a'.repeat(500)}`), ['createdAt']);
    expect(parsed.search).toHaveLength(100);
  });

  it('computes pagination metadata', () => {
    const query = parseListQuery(url('page=2&per_page=10'), ['createdAt']);
    expect(buildMeta(query, 35)).toEqual({ page: 2, perPage: 10, total: 35, totalPages: 4 });
    expect(buildMeta(query, 0).totalPages).toBe(1);
  });
});
