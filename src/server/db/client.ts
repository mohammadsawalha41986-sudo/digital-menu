import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getEnv } from '@/lib/env';

/**
 * Single Prisma client for the process.
 *
 * Prisma 7 connects through a driver adapter, so the connection string is read
 * from the validated environment here rather than from the schema file.
 *
 * The client is created lazily, on first use, and reached through a proxy.
 * That is deliberate: a production *build* must not require production
 * secrets. Next collects page data at build time, and an eagerly constructed
 * client would drag `getEnv()` — and with it the production secret checks —
 * into `docker build`, where those values legitimately do not exist yet.
 * Validation still happens, just on the first request instead.
 *
 * The globalThis cache prevents connection exhaustion across hot reloads.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const env = getEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  const client = new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  if (env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client;
  }

  return client;
}

function getClient(): PrismaClient {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getClient(), property, receiver);
  },
});
