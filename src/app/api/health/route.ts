import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { prisma } from '@/server/db/client';
import { getStorage } from '@/server/storage';

/**
 * Health / readiness endpoint (master spec §135).
 *
 * Checks the application, the database and the storage provider. Returns 200
 * when every dependency is up and 503 otherwise, so Docker, Coolify or a load
 * balancer can gate traffic on it.
 *
 * It never reports connection strings, credentials or driver error text — a
 * failing check reports only which dependency failed (master spec §127).
 */

export const dynamic = 'force-dynamic';

type CheckStatus = 'up' | 'down';

interface HealthReport {
  status: 'ok' | 'degraded';
  checks: Record<string, CheckStatus>;
  environment: string;
  timestamp: string;
}

export async function GET() {
  const env = getEnv();

  const [database, storage] = await Promise.all([checkDatabase(), checkStorage()]);
  const checks: Record<string, CheckStatus> = { application: 'up', database, storage };
  const healthy = Object.values(checks).every((value) => value === 'up');

  const body: HealthReport = {
    status: healthy ? 'ok' : 'degraded',
    checks,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}

async function checkDatabase(): Promise<CheckStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'up';
  } catch {
    return 'down';
  }
}

async function checkStorage(): Promise<CheckStatus> {
  try {
    // Cheap round trip: a miss is a healthy answer, a throw is not.
    await getStorage().exists('.healthcheck');
    return 'up';
  } catch {
    return 'down';
  }
}
