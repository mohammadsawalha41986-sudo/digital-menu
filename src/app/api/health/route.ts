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

/**
 * Storage readiness, cached briefly.
 *
 * The probe is a real write-read-delete rather than a lookup: asking whether
 * some key exists answers "no" for a healthy empty store and "no" for one that
 * cannot be written at all, so an unmounted or read-only volume reported `up`
 * and the first upload was where anyone found out.
 *
 * The cache is why that is safe to do here. This endpoint is public and
 * unauthenticated, and without it every request would become a disk write —
 * an amplifier anyone could pull on. Readiness does not change from
 * millisecond to millisecond, so a short window costs an orchestrator probing
 * every 30s nothing and makes request volume irrelevant. Failures are cached
 * too: a broken store that recovers is reported up within the window, which is
 * the same latency a probe interval already imposes.
 */
const STORAGE_CACHE_MS = 10_000;

let storageCache: { status: CheckStatus; checkedAt: number } | undefined;
let storageInFlight: Promise<CheckStatus> | undefined;

async function checkStorage(): Promise<CheckStatus> {
  const now = Date.now();

  if (storageCache && now - storageCache.checkedAt < STORAGE_CACHE_MS) {
    return storageCache.status;
  }

  // Concurrent requests share one probe rather than racing a write each.
  storageInFlight ??= runStorageProbe().finally(() => {
    storageInFlight = undefined;
  });

  return storageInFlight;
}

async function runStorageProbe(): Promise<CheckStatus> {
  const status: CheckStatus = await getStorage()
    .probe()
    .then<CheckStatus>(() => 'up')
    .catch<CheckStatus>(() => 'down');

  storageCache = { status, checkedAt: Date.now() };
  return status;
}

