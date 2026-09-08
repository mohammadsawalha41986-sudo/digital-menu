import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { listMedia } from '@/server/media/service';
import { TenantAccessError } from '@/server/tenancy/context';
import {
  assignMediaAction,
  backfillDerivativesAction,
  deleteMediaAction,
  linkMediaAction,
  setAltTextAction,
  setFocalPointAction,
  uploadMediaAction,
} from '@/server/admin/media-actions';
import { MediaLibrary } from './library';
import { LinkImageForm } from './link-form';

export const dynamic = 'force-dynamic';

export default async function MediaPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const media = await listMedia(user, businessId);

  const itemCodes = business.menus.flatMap((menu) =>
    menu.categories.flatMap((category) => category.items.map((item) => item.itemCode)),
  );
  const categoryKeys = business.menus.flatMap((menu) =>
    menu.categories.map((category) => category.key),
  );

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Media</h1>
          <p className="admin__subtitle">
            Upload once, assign anywhere. Alt text is authored per language and never
            generated from a filename.
          </p>
        </div>
        <Link
          href={`/admin/businesses/${business.id}`}
          className="admin__button admin__button--secondary"
        >
          Back to business
        </Link>
      </header>

      <LinkImageForm action={linkMediaAction.bind(null, business.id, business.publicId)} />

      <MediaLibrary
        businessId={business.id}
        publicId={business.publicId}
        media={media.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          url: entry.url,
          sourceUrl: entry.sourceUrl,
          altAr: entry.altAr,
          altEn: entry.altEn,
          originalName: entry.originalName,
          sizeKb: Math.ceil(entry.sizeBytes / 1024),
          width: entry.width,
          height: entry.height,
          focalX: entry.focalX,
          focalY: entry.focalY,
          derivativeWidths: entry.derivativeWidths,
          quality: entry.quality,
        }))}
        itemCodes={itemCodes}
        categoryKeys={categoryKeys}
        uploadMedia={uploadMediaAction.bind(null, business.id, business.publicId)}
        assignMedia={assignMediaAction.bind(null, business.id, business.publicId)}
        setFocalPoint={setFocalPointAction}
        setAltText={setAltTextAction}
        optimiseAll={backfillDerivativesAction}
        deleteMedia={deleteMediaAction}
      />
    </>
  );
}
