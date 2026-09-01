import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getProfileForPreview } from '@/server/profile/repository';
import { renderProfile, type SearchParams } from '@/server/profile/render';
import { recordPreviewView, resolvePreviewToken } from '@/server/review/service';
import { RULES, clientIdentity, consume } from '@/server/security/rate-limit';
import { respondAction } from './actions';
import { ReviewBar } from './review-bar';

export const dynamic = 'force-dynamic';

/**
 * The client's review page (master spec §71, §72, §139).
 *
 * What a client gets instead of an account: a link that shows the profile
 * exactly as it will look, and two buttons — approve, or ask for a change.
 *
 * Four properties make this safe to hand out:
 *
 *  - The token is unguessable and only its hash is stored, so this page cannot
 *    be reached by trying public ids.
 *  - It expires and can be revoked, and both are checked on every request
 *    rather than only at issue.
 *  - It renders through the *real* profile path, so what the client approves is
 *    what the visitor will see — a bespoke preview renderer would drift, and
 *    the drift would be discovered by the client.
 *  - It records no analytics, so an approval round does not appear in the
 *    business's visitor numbers.
 *
 * `robots: noindex` because a shared link must not become a search result, and
 * a rate limit because guessing a token is the only attack this page has.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { token } = await params;
  const headerStore = await headers();

  if (consume(RULES.previewToken, clientIdentity(headerStore)).limited) notFound();

  const link = await resolvePreviewToken(token);

  // Expired, revoked, unknown and wrong all look identical from out here.
  if (!link) notFound();

  const profile = await getProfileForPreview(link.businessId);
  if (!profile) notFound();

  await recordPreviewView(link.id);

  const resolved = await searchParams;

  return (
    <>
      <ReviewBar
        businessName={profile.nameEn ?? profile.nameAr}
        state={link.state}
        action={respondAction.bind(null, token)}
      />
      {await renderProfile(profile, resolved, { preview: true })}
    </>
  );
}
