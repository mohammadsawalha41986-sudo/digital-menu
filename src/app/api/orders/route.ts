import { NextResponse } from 'next/server';
import { parsePublicId } from '@/lib/public-id';
import { recordMenuOrder, type MenuOrderInput } from '@/server/customers/record';
import { RULES, clientIdentity, consume } from '@/server/security/rate-limit';

/**
 * An order as it leaves the menu for WhatsApp, recorded for the restaurant's
 * order log and dashboard. The menu fires this after opening WhatsApp and
 * never waits on it, so a slow or failed write cannot hold up an order.
 *
 * Untrusted input: validated and bounded in recordMenuOrder. The answer is
 * the same whether or not anything was recorded, so this endpoint does not
 * reveal which restaurants or dishes exist.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null) return new NextResponse(null, { status: 400 });
    body = parsed as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const publicId = typeof body.publicId === 'string' ? parsePublicId(body.publicId) : null;
  if (!publicId) return new NextResponse(null, { status: 400 });

  if (consume(RULES.menuOrders, `${clientIdentity(request)}:${publicId}`).limited) {
    return new NextResponse(null, { status: 429 });
  }

  try {
    await recordMenuOrder(publicId, body as unknown as MenuOrderInput);
  } catch (error) {
    // The customer's order already went to WhatsApp; a failed copy is logged, never surfaced.
    console.error('menu order not recorded', error instanceof Error ? error.message : error);
  }
  return new NextResponse(null, { status: 204 });
}
