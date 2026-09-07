import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicProfile } from '@/server/profile/repository';
import { renderProfile, type SearchParams } from '@/server/profile/render';

/**
 * EMBEDDABLE PROFILE — `/embed/{publicId}`.
 *
 * The same profile, rendered to be put inside someone else's website with one
 * `<iframe>`: WordPress, Shopify, Webflow, plain HTML, anything.
 *
 * It is a separate path rather than `?embed=1` on the canonical URL for one
 * reason that matters: `frame-ancestors`. The public profile is deliberately
 * framable only by this origin, because cross-origin framing of a page is
 * clickjacking. An embed is the one case where being framed anywhere is the
 * entire point, and a path lets that exception be declared in exactly one
 * place (`next.config.ts`) and audited there — rather than smuggled in behind
 * a query parameter that any URL could carry.
 *
 * It is also `noindex`: the canonical menu URL is the one that should rank,
 * and two indexable copies of the same menu compete with each other.
 */

interface PageProps {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<SearchParams>;
}

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EmbeddedProfilePage({ params, searchParams }: PageProps) {
  const { publicId } = await params;

  const profile = await getPublicProfile(publicId);
  if (!profile) notFound();

  return renderProfile(profile, await searchParams, { embed: true });
}
