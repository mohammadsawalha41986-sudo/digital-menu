import type { NextConfig } from 'next';

/**
 * Security response headers (master spec §126).
 *
 * Two things shape this policy:
 *
 *  1. The public profile is server-rendered with **one** inline script — the
 *     ~900-byte analytics beacon in `src/server/profile/analytics-script.tsx`.
 *     Next's App Router also inlines its own bootstrap. Both mean a strict
 *     `script-src 'self'` would break the page, so the policy uses
 *     `'unsafe-inline'` for scripts and compensates elsewhere: no external
 *     script origin is permitted at all, so an injected `<script src>` has
 *     nowhere to load from, and `object-src 'none'` plus `base-uri 'self'`
 *     close the two classic bypasses.
 *
 *  2. Images come from the business's own uploads, served from this origin,
 *     plus `data:` for the QR previews the admin renders inline. Nothing else
 *     is allowed to embed.
 *
 * `frame-ancestors 'none'` is the modern form of X-Frame-Options; the older
 * header is sent too, because some corporate proxies still only read that one.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // No feature here is used by either the public profile or the admin.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/**
 * HSTS is production-only on purpose: sending it from a local HTTP dev server
 * pins `localhost` to HTTPS in the developer's browser, which is a genuinely
 * annoying thing to have to undo.
 */
const PRODUCTION_HEADERS =
  process.env.NODE_ENV === 'production'
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains',
        },
      ]
    : [];

const config: NextConfig = {
  reactStrictMode: true,
  // Emits a minimal server bundle for the Docker runtime image.
  output: 'standalone',
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [...SECURITY_HEADERS, ...PRODUCTION_HEADERS],
      },
    ];
  },
};

export default config;
