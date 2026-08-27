import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { listFilesForAdmin } from '@/server/files/service';
import { TenantAccessError } from '@/server/tenancy/context';
import {
  createLinkAction,
  deleteFileAction,
  toggleFileVisibilityAction,
  uploadFileAction,
} from '@/server/admin/file-actions';
import { FileManager } from './file-manager';

export const dynamic = 'force-dynamic';

export default async function FilesPage({
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

  const files = await listFilesForAdmin(user, businessId);

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Files and menu links</h1>
          <p className="admin__subtitle">
            Published files appear on the public profile at{' '}
            <code>/f/{business.publicId}/&#123;key&#125;</code>. Replacing a PDF adds a version and
            leaves the QR and URL untouched.
          </p>
        </div>
        <Link
          href={`/admin/businesses/${business.id}`}
          className="admin__button admin__button--secondary"
        >
          Back to business
        </Link>
      </header>

      <FileManager
        businessId={business.id}
        publicId={business.publicId}
        files={files.map((file) => ({
          id: file.id,
          key: file.key,
          kind: file.kind,
          titleAr: file.titleAr,
          titleEn: file.titleEn,
          isPublic: file.isPublic,
          allowDownload: file.allowDownload,
          externalUrl: file.externalUrl,
          versionCount: file._count.versions,
          currentVersion: file.currentVersion?.version ?? null,
          sizeBytes: file.currentVersion?.sizeBytes ?? null,
        }))}
        uploadFile={uploadFileAction.bind(null, business.id, business.publicId)}
        createLink={createLinkAction.bind(null, business.id, business.publicId)}
        toggleVisibility={toggleFileVisibilityAction}
        deleteFile={deleteFileAction}
      />
    </>
  );
}
