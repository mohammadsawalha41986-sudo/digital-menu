import { NextResponse } from 'next/server';
import { getStorage } from '@/server/storage';
import { StorageError } from '@/server/storage/provider';
import { prisma } from '@/server/db/client';

/**
 * Serves objects held by the local StorageProvider.
 *
 * Only exists for the `local` provider: with R2 the public URL points at the
 * bucket and this route is never hit. It is deliberately thin, and it is *not*
 * an open file server — the requested key must correspond to a Media row, so
 * an object that is on disk but not registered in the database cannot be
 * fetched by guessing a path (master spec §108).
 */

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await context.params;
  const key = segments.join('/');

  const media = await prisma.media.findUnique({
    where: { storageKey: key },
    select: { contentType: true, sizeBytes: true },
  });

  if (!media) return new NextResponse(null, { status: 404 });

  try {
    const body = await getStorage().get(key);
    if (!body) return new NextResponse(null, { status: 404 });

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'content-type': media.contentType,
        'content-length': String(media.sizeBytes),
        // Content is immutable per key: a replacement writes a new key, so a
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
