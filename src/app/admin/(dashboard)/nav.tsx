'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The one client component in the admin shell: it needs the current pathname
 * to mark the active link. Everything else stays on the server.
 */
const LINKS = [
  { href: '/admin', label: 'Dashboard', exact: true, superAdminOnly: false },
  { href: '/admin/businesses', label: 'Businesses', exact: false, superAdminOnly: false },
  { href: '/admin/search', label: 'Search', exact: false, superAdminOnly: false },
  { href: '/admin/staff', label: 'Staff', exact: false, superAdminOnly: true },
  { href: '/admin/api-keys', label: 'API keys', exact: false, superAdminOnly: true },
  { href: '/admin/account', label: 'Account', exact: false, superAdminOnly: false },
] as const;

export function AdminNav({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="admin__nav" aria-label="Admin">
      {LINKS.filter((link) => !link.superAdminOnly || isSuperAdmin).map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            className="admin__nav-link"
            aria-current={active ? 'page' : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
