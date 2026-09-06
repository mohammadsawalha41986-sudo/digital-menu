import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/current-user';
import { globalSearch } from '@/server/admin/search';
import { RULES, clientIdentity, consume } from '@/server/security/rate-limit';

/**
 * GET /api/admin/palette?q= — results for the command palette.
 *
 * The palette queries per keystroke, which the full search page does not, so
 * this is a route rather than a server action: an action per keystroke queues
 * behind the router and re-renders the tree for a list that will be thrown
 * away two characters later.
 *
 * It adds no reach of its own. `globalSearch` resolves the businesses the user
 * may see *first* and bounds every query to them, so this endpoint can only
 * ever return what its caller could already read. The session gate is the same
 * one the dashboard layout applies.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getCurrentUser();

  // 401 with no detail: whether an admin API exists is not worth confirming to
  // an unauthenticated caller.
  if (!user) return new NextResponse(null, { status: 401 });

  // A palette types fast, so the ceiling is high — but it is a ceiling. A
  // search endpoint with none is a database-load amplifier for any account.
  const limit = consume(RULES.palette, `${user.id}:${clientIdentity(request)}`);

  if (limit.limited) {
    const seconds = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));

    return NextResponse.json(
      { error: 'Too many requests.' },
      { status: 429, headers: { 'Retry-After': String(seconds) } },
    );
  }

  const query = new URL(request.url).searchParams.get('q') ?? '';
  const { hits, truncated } = await globalSearch(user, query);

  return NextResponse.json(
    { hits: hits.slice(0, 20), truncated: truncated || hits.length > 20 },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
