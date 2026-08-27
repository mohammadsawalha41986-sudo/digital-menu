import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicProfile } from '@/server/profile/repository';
import { renderProfile, type SearchParams } from '@/server/profile/render';
import { buildProfileMetadata } from '@/server/profile/metadata';

/**
 * THE PERMANENT PUBLIC PROFILE — `/m/{publicId}`.
 *
 * This route is the destination every printed QR code points at, and the
 * single most load-bearing URL in the product. Its contract (master spec §10,
 * §11, §149–§152; GOALS I1, I2):
 *
 *   - The path contains an opaque public identifier, never a database id.
 *   - The path never changes: not when the menu changes, not when prices
 *     change, not when the brand, template or language changes. Everything
 *     variable is resolved *behind* this URL.
 */

interface PageProps {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<SearchParams>;
}

// Read-heavy and cache-friendly, but a price change must be visible
// immediately, so the page revalidates on demand rather than on a timer.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { publicId } = await params;
  const profile = await getPublicProfile(publicId);
  return buildProfileMetadata(profile, await searchParams);
}

export default async function PublicProfilePage({ params, searchParams }: PageProps) {
  const { publicId } = await params;

  // Malformed ids and non-active businesses both resolve to null; the visitor
  // sees one indistinguishable "unavailable" state either way, so the route
  // does not confirm which businesses exist.
  const profile = await getPublicProfile(publicId);
  if (!profile) notFound();

  return renderProfile(profile, await searchParams);
}
