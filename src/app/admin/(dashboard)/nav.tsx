'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The one client component in the admin shell: it needs the current pathname
 * to mark the active link. Everything else stays on the server.
 */
const LINKS = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/businesses', label: 'Businesses', exact: false },
  { href: '/admin/api-keys', label: 'API keys', exact: false },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin__nav" aria-label="Admin">
      {LINKS.map((link) => {
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
