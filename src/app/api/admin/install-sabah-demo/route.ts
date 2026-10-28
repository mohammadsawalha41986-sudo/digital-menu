import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/current-user';
import { installSabahDemo } from '@/server/admin/sabah-demo';

/**
 * POST /api/admin/install-sabah-demo — one-click install of the full Sabah El
 * Lail demo restaurant into this environment.
 *
 * Why this exists:
 *  - The release container ships without `tsx` or the Prisma CLI, so
 *    `npm run db:seed` cannot be executed from a Railway shell against
 *    production. The seed script is only reachable at build time.
 *  - An operator who wants to see the Street Food family end-to-end on a
 *    fresh deployment would otherwise have to type the restaurant, its 11
 *    categories and ~25 items by hand — 20 minutes of data entry for
 *    something that is already in `prisma/seed-sabah.ts`.
 *
 * The handler reuses the exact write path the seed module uses (one shared
 * implementation in `installSabahDemo`), so repeat invocations converge
 * rather than duplicating rows. SUPER_ADMIN only — this provisions a
 * tenant and sets its brand.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  // Tenant provisioning is a staff action, not something an EDITOR or VIEWER
  // on another business can trigger — the handler creates a new business
  // keyed on a reserved publicId.
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { error: 'Only platform admins may install demos.' },
      { status: 403 },
    );
  }

  try {
    const result = await installSabahDemo(user.id);
    return NextResponse.json(
      {
        ok: true,
        publicId: result.publicId,
        businessId: result.businessId,
        categoryCount: result.categoryCount,
        itemCount: result.itemCount,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
