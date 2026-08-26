/**
 * Platform root. The marketing site is a separate property (master spec §05)
 * and the platform brand stays out of a visitor's way (§146), so this is a
 * deliberately plain operational placeholder rather than a landing page.
 */
export default function HomePage() {
  return (
    <main style={{ padding: 'var(--sys-space-6)' }}>
      <h1>Digital Profile OS</h1>
      <p>
        Public profiles are served from <code>/m/&#123;publicId&#125;</code>. Staff tooling arrives
        at <code>/admin</code> in Phase 3.
      </p>
    </main>
  );
}
