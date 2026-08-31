import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { listChangeRequests, listPreviewLinks } from '@/server/review/service';
import {
  addChangeRequestAction,
  createPreviewLinkAction,
  revokePreviewLinkAction,
  setChangeRequestDoneAction,
} from '@/server/admin/review-actions';
import { TenantAccessError } from '@/server/tenancy/context';
import { ReviewManager } from './manager';

export const dynamic = 'force-dynamic';

/**
 * Client review (master spec §71–§73, §139, §140).
 *
 * Where staff send a profile out for approval and work through what comes
 * back. The client needs no account; the record of what they said lives here.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();

  const [links, requests] = await Promise.all([
    listPreviewLinks(user, businessId).catch((error) => {
      if (error instanceof TenantAccessError) notFound();
      throw error;
    }),
    listChangeRequests(user, businessId),
  ]);

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Client review</h1>
          <p className="admin__subtitle">
            Send a link, collect a decision.{' '}
            <Link href={`/admin/businesses/${businessId}`}>Back to business</Link>
          </p>
        </div>
      </header>

      <ReviewManager
        businessId={businessId}
        links={links.map((link) => ({
          ...link,
          expiresAt: link.expiresAt.toISOString(),
          revokedAt: link.revokedAt?.toISOString() ?? null,
          respondedAt: link.respondedAt?.toISOString() ?? null,
          lastViewed: link.lastViewed?.toISOString() ?? null,
          createdAt: link.createdAt.toISOString(),
        }))}
        requests={requests.map((request) => ({
          id: request.id,
          body: request.body,
          isDone: request.isDone,
          createdAt: request.createdAt.toISOString(),
          completedBy: request.completedBy?.name ?? null,
        }))}
        createLink={createPreviewLinkAction.bind(null, businessId)}
        revokeLink={revokePreviewLinkAction}
        addRequest={addChangeRequestAction.bind(null, businessId)}
        setDone={setChangeRequestDoneAction}
      />
    </>
  );
}
