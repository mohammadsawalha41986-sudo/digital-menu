import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicProfile } from '@/server/profile/repository';
import { renderProfile, type SearchParams } from '@/server/profile/render';

/**
 * EMBEDDABLE SINGLE MENU — `/embed/{publicId}/menu/{menuKey}`.
 *
 * A restaurant's website usually wants one menu on one page — the drinks list
 * on the bar page, breakfast on the breakfast page — not the whole profile.
 * Same narrowing as the public single-menu route; same framing exception as
 * the embed above.
 */

interface PageProps {
  params: Promise<{ publicId: string; menuKey: string }>;
  searchParams: Promise<SearchParams>;
}

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EmbeddedMenuPage({ params, searchParams }: PageProps) {
  const { publicId, menuKey } = await params;

  const profile = await getPublicProfile(publicId, { menuKey });
  if (!profile || profile.menus.length === 0) notFound();

  return renderProfile(profile, await searchParams, { embed: true });
}
