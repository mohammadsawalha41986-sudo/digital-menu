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
 *
 * `dir="ltr"` is pinned here deliberately. The document direction is
 * negotiated for *visitors*, and Arabic is the default, so without this the
 * English staff tooling renders right-to-left for anyone whose browser does
 * not ask for English — sidebar on the wrong side, labels reversed, forms
 * mirrored. Business content inside the admin still carries its own `dir` per
 * field, which is what makes an Arabic dish name read correctly in an English
 * form.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin" dir="ltr" lang="en">
      {children}
    </div>
  );
}
