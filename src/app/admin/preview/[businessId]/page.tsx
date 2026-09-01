import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/current-user';
import { requireTenantContext, TenantAccessError } from '@/server/tenancy/context';
import { getProfileForPreview } from '@/server/profile/repository';
import { renderProfile, type SearchParams } from '@/server/profile/render';

export const dynamic = 'force-dynamic';

/**
 * The builder's preview surface.
 *
 * It renders the *real* profile through the *real* render path — same query,
 * same read model, same templates, same brand tokens. The only differences are
 * that it can see a draft business and unpublished menus, and that it records
 * no analytics.
 *
 * That matters more than it sounds: a preview built from its own mock renderer
 * drifts from the live page, and the drift is only discovered by a customer.
 * Here there is nothing to drift.
 *
 * Access is staff-only and tenant-scoped: a business the signed-in user has no
 * grant on is a 404, exactly as it would be if it did not exist.
 */
export default async function BuilderPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { businessId } = await params;

  // An unauthenticated request must be redirected, not thrown at. This route
  // is loaded inside iframes, and an uncaught error there renders as a broken
  // frame with no explanation — which is exactly how a preview defect hides.
  const user = await getCurrentUser();
  if (!user) redirect(`/admin/login?next=/admin/preview/${businessId}`);

  const context = await requireTenantContext(user, businessId, 'VIEWER').catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const resolved = await searchParams;
  const branchKey = typeof resolved.branch === 'string' ? resolved.branch : null;

  const profile = await getProfileForPreview(context.businessId, { branchKey });
  if (!profile) notFound();

  // `?template=` lets the style picker show the owner's own menu in a style
  // they have not chosen yet. It is a rendering override for this response
  // only — nothing is written, and resolveTemplate falls back for a key that
  // does not exist, so a stale link cannot produce a blank page.
  const template = typeof resolved.template === 'string' ? resolved.template : null;

  return renderProfile(
    template ? { ...profile, templateKey: template, variantKey: 'a' } : profile,
    resolved,
    { preview: true },
  );
}
