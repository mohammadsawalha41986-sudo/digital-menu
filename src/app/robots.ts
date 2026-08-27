import type { MetadataRoute } from 'next';
import { getEnv } from '@/lib/env';

/**
 * Robots policy (master spec §116).
 *
 * Everything operational is disallowed outright — admin, the API, uploads and
 * file downloads. Public profiles are allowed as a path, but each one still
 * carries its own `robots` meta reflecting the business's indexing setting, so
 * a crawler that ignores this file still sees a per-business instruction.
 */
// Dynamic because it reads the validated environment: a production *build*
// must never require production configuration (see docs/ARCHITECTURE.md §2).
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const base = getEnv().PUBLIC_URL.replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/m/'],
        disallow: ['/admin', '/api/', '/uploads/', '/f/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
