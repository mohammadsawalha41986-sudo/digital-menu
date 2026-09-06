import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/current-user';
import { signOutAction } from '@/server/auth/actions';
import { AdminNav } from './nav';
import { CommandPalette } from './command-palette';

/**
 * Authenticated admin shell.
 *
 * The gate is here rather than in middleware: middleware cannot read the
 * database, so it could only check that a token parses — not that the account
 * still exists and is active. Doing it in a server layout means every page
 * beneath it is behind a real check (master spec §128).
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) redirect('/admin/login');

  return (
    <div className="admin__shell">
      <aside className="admin__sidebar">
        <span className="admin__brand">Digital Profile OS</span>
        <CommandPalette />
        <AdminNav isSuperAdmin={user.role === 'SUPER_ADMIN'} />
        <form action={signOutAction} className="admin__actions">
          <button type="submit" className="admin__button admin__button--secondary">
            Sign out
          </button>
        </form>
      </aside>
      <main className="admin__main">{children}</main>
    </div>
  );
}
