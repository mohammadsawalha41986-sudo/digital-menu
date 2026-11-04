import { NextResponse } from 'next/server';
import { parsePublicId } from '@/lib/public-id';
import { subscribeToOffers } from '@/server/customers/record';
import { RULES, clientIdentity, consume } from '@/server/security/rate-limit';

/**
 * A customer asking for a restaurant's offers, from the sign-up card on its
 * menu. Recorded only when the restaurant has sign-up turned on and the phone
 * number reads as one; the menu is told whether it was saved.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null) return NextResponse.json({ ok: false }, { status: 400 });
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const publicId = typeof body.publicId === 'string' ? parsePublicId(body.publicId) : null;
  if (!publicId || body.consent !== true) return NextResponse.json({ ok: false }, { status: 400 });

  if (consume(RULES.offersSignup, `${clientIdentity(request)}:${publicId}`).limited) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const ok = await subscribeToOffers(publicId, { name: body.name, phone: body.phone });
  return NextResponse.json({ ok }, { status: ok ? 200 : 422, headers: { 'cache-control': 'no-store' } });
}
