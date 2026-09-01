import { NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { parsePublicId } from '@/lib/public-id';
import { isEventType, recordEvent } from '@/server/analytics/record';
import { RULES, clientIdentity, consume } from '@/server/security/rate-limit';

/**
 * Interaction event ingest.
 *
 * Called by the public profile's small event script for things the server
 * cannot observe — a contact button tapped, a download opened, a category
 * scrolled to.
 *
 * Untrusted input, so: the public id is validated and resolved to an active
 * business, the event type must be one of a fixed list, the target key is
 * length-bounded, and the shared rate limiter caps how much one client can
 * write. Nothing here reflects input back to the caller.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (typeof payload !== 'object' || payload === null) {
    return new NextResponse(null, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const publicId = typeof body.publicId === 'string' ? parsePublicId(body.publicId) : null;
  const eventType = typeof body.event === 'string' ? body.event : '';

  if (!publicId || !isEventType(eventType)) {
    return new NextResponse(null, { status: 400 });
  }

  if (consume(RULES.events, `${clientIdentity(request)}:${publicId}`).limited) {
    return new NextResponse(null, { status: 429 });
  }

  const business = await prisma.business.findFirst({
    where: { publicId, status: 'ACTIVE' },
    select: { id: true },
  });

  // An unknown or inactive business gets the same answer as a successful
  // write: this endpoint must not confirm which businesses exist.
  if (business) {
    await recordEvent({
      businessId: business.id,
      eventType,
      branchKey: typeof body.branch === 'string' ? body.branch.slice(0, 64) : null,
      targetKey: typeof body.target === 'string' ? body.target.slice(0, 128) : null,
      locale: typeof body.locale === 'string' ? body.locale.slice(0, 8) : null,
      headers: request.headers,
    });
  }

  // 204 with no body: there is nothing useful to return, and an empty response
  // keeps the beacon cheap.
  return new NextResponse(null, { status: 204 });
}
