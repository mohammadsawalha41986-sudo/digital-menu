import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { loadStaffMenu } from '@/server/staff/availability';
import { RULES, clientIdentity, consume } from '@/server/security/rate-limit';
import { StaffMenu } from './staff-menu';

export const dynamic = 'force-dynamic';

/**
 * A restaurant's staff page, reached by a link the manager gave them.
 *
 * It shows the dishes and lets the person mark each one available, out right
 * now, or hidden. Nothing else: no prices, no account, no other restaurant.
 *
 * `robots: noindex` because a staff link must never become a search result.
 * Any failure (unknown, wrong, revoked, expired, rate-limited) is the same 404,
 * so a guesser learns nothing from the difference.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function StaffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headerStore = await headers();

  if (consume(RULES.staffToken, clientIdentity(headerStore)).limited) notFound();

  const menu = await loadStaffMenu(token);
  if (!menu) notFound();

  return (
    <StaffMenu
      token={token}
      label={menu.label}
      businessName={menu.businessName}
      sections={menu.sections}
    />
  );
}
