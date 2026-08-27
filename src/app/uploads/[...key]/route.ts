import { NextResponse } from 'next/server';
import { getStorage } from '@/server/storage';
import { StorageError } from '@/server/storage/provider';
import { prisma } from '@/server/db/client';
import { getCurrentUser } from '@/server/auth/current-user';
import { resolveTenantContext } from '@/server/tenancy/context';

/**
 * Serves objects held by the local StorageProvider.
 *
 * Only exists for the `local` provider: with R2 the public URL points at the
 * bucket and this route is never hit.
 *
 * It is deliberately *not* an open file server. Three conditions gate it
 * (master spec §108):
 *
 *  1. The key must correspond to a `Media` row — an object on disk that no row
 *     references cannot be fetched by guessing a path.
 *  2. The owning business must be ACTIVE…
 *  3. …**or** the requester must be staff with a grant on it. Without that
 *     second branch, an operator could not preview the images of a business
 *     they are still setting up, which is exactly when they need to.
 */

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await context.params;
  const key = segments.join('/');

  const media = await prisma.media.findUnique({
    where: { storageKey: key },
    select: {
      contentType: true,
      sizeBytes: true,
      businessId: true,
      business: { select: { status: true } },
    },
  });

  if (!media) return new NextResponse(null, { status: 404 });

  if (media.business.status !== 'ACTIVE' && !(await staffMayView(media.businessId))) {
    // Same answer as a missing object: the route does not disclose that a
    // draft business's media exists.
    return new NextResponse(null, { status: 404 });
  }

  try {
    const body = await getStorage().get(key);
    if (!body) return new NextResponse(null, { status: 404 });

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'content-type': media.contentType,
        'content-length': String(media.sizeBytes),
        // Content is immutable per key — a replacement writes a new key — so a
        // long cache is safe and keeps the public profile fast (§115).
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    // A malformed key is a bad request, not a server fault.
    if (error instanceof StorageError) return new NextResponse(null, { status: 400 });
    throw error;
  }
}

async function staffMayView(businessId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  return (await resolveTenantContext(user, businessId)) !== null;
}
