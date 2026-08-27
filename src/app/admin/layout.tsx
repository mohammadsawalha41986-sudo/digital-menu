import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Digital Profile OS — Admin',
  robots: { index: false, follow: false },
};

/**
 * Admin shell wrapper. The navigation itself lives in `(dashboard)/layout.tsx`
 * so the login screen — which has no authenticated user and no navigation —
 * can share the visual system without it.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin">{children}</div>;
}
