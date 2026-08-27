import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicProfile } from '@/server/profile/repository';
import { renderProfile, type SearchParams } from '@/server/profile/render';
import { buildProfileMetadata } from '@/server/profile/metadata';

/**
 * PERMANENT BRANCH PROFILE — `/m/{publicId}/b/{branchKey}` (master spec §85).
 *
 * A branch has its own permanent QR. The path extends the business path rather
 * than replacing it, so both codes stay valid forever and a branch QR keeps
 * working even if branch content changes (GOALS I1, I2).
 */

interface PageProps {
  params: Promise<{ publicId: string; branchKey: string }>;
  searchParams: Promise<SearchParams>;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { publicId, branchKey } = await params;
  const profile = await getPublicProfile(publicId, { branchKey });
  return buildProfileMetadata(profile, await searchParams);
}

export default async function BranchProfilePage({ params, searchParams }: PageProps) {
  const { publicId, branchKey } = await params;

  const profile = await getPublicProfile(publicId, { branchKey });
  if (!profile) notFound();

  return renderProfile(profile, await searchParams);
}
