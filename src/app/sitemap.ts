import type { MetadataRoute } from 'next';
import { getEnv } from '@/lib/env';
import { prisma } from '@/server/db/client';

/**
 * Sitemap (master spec §116).
 *
 * Only businesses that are ACTIVE *and* have opted into indexing appear. That
 * opt-in is per business and off by default: a client's menu should not turn
 * up in search results because the platform decided it should.
 *
 * Each entry lists both language variants as alternates, pointing at the same
 * permanent path with a `lang` parameter — so a search engine indexes one
 * canonical URL per business, which is also the URL the QR encodes.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getEnv().PUBLIC_URL.replace(/\/$/, '');

  const businesses = await prisma.business.findMany({
    where: { status: 'ACTIVE', indexProfile: true },
    orderBy: { updatedAt: 'desc' },
    take: 5000,
    select: {
      publicId: true,
      updatedAt: true,
      branches: { where: { isActive: true }, select: { key: true } },
    },
  });

  return businesses.flatMap((business) => {
    const url = `${base}/m/${business.publicId}`;

    const entry: MetadataRoute.Sitemap[number] = {
      url,
      lastModified: business.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
      alternates: {
        languages: {
          ar: `${url}?lang=ar`,
          en: `${url}?lang=en`,
        },
      },
    };

    const branchEntries = business.branches.map((branch) => ({
      url: `${url}/b/${branch.key}`,
      lastModified: business.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));

    return [entry, ...branchEntries];
  });
}
