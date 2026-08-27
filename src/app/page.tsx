import Link from 'next/link';

/**
 * Platform root.
 *
 * The marketing site is a separate property (master spec §05) and the platform
 * brand stays out of a visitor's way (§146), so this is an operational page,
 * not a landing page: a visitor arrives at a business profile, never here.
 * What it must not be is a lie — it points at the two things that exist.
 */
export default function HomePage() {
  return (
    <main
      style={{
        padding: 'var(--sys-space-6)',
        maxWidth: '38rem',
        marginInline: 'auto',
        display: 'grid',
        gap: 'var(--sys-space-4)',
      }}
    >
      <h1>Digital Profile OS</h1>
      <p>
        Public profiles are served from <code>/m/&#123;publicId&#125;</code> — the permanent
        address a QR code resolves to.
      </p>
      <p>
        <Link href="/admin">Staff sign in</Link>
      </p>
    </main>
  );
}
