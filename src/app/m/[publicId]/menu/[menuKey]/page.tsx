import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicProfile } from '@/server/profile/repository';
import { renderProfile, type SearchParams } from '@/server/profile/render';
import { buildProfileMetadata } from '@/server/profile/metadata';

/**
 * PERMANENT SINGLE-MENU PAGE — `/m/{publicId}/menu/{menuKey}`.
 *
 * A business may publish several menus — breakfast, dinner, drinks, a Ramadan
 * menu — and each needs an address of its own: its own QR on its own table
 * tent, its own link to send, its own embed on a page that should show the
 * drinks list and nothing else.
 *
 * The path *extends* the business path rather than replacing it, exactly as
 * the branch route does, so the business QR and every menu QR stay valid
 * forever and independently (GOALS I1, I2).
 *
 * This is not a different page: it is the same profile with `menus` narrowed
 * to one, so every template renders it without knowing this route exists.
 *
 * An unresolved key 404s rather than falling back to "all menus". A menu URL
 * is a printed QR's whole destination; quietly serving a different page than
 * the one on the table is worse than saying the menu is unavailable.
 */

interface PageProps {
  params: Promise<{ publicId: string; menuKey: string }>;
  searchParams: Promise<SearchParams>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { publicId, menuKey } = await params;
  const profile = await getPublicProfile(publicId, { menuKey });
  return buildProfileMetadata(profile, await searchParams, { menuKey });
}

export default async function SingleMenuPage({ params, searchParams }: PageProps) {
  const { publicId, menuKey } = await params;

  const profile = await getPublicProfile(publicId, { menuKey });

  // No profile, or a key that matched no live menu.
  if (!profile || profile.menus.length === 0) notFound();

  return renderProfile(profile, await searchParams);
}
