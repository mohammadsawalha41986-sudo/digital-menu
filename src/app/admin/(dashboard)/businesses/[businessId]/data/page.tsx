import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { prisma } from '@/server/db/client';
import {
  confirmImportAction,
  previewImportAction,
  rollbackImportAction,
} from '@/server/admin/import-actions';
import {
  confirmImageZipAction,
  previewImageZipAction,
} from '@/server/admin/image-import-actions';
import { ActionButton } from '../../../components';
import { ImportWizard } from './import-wizard';
import { ImageZipImporter } from './image-zip-importer';

export const dynamic = 'force-dynamic';

export default async function DataPage({
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

  const batches = await prisma.importBatch.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { user: { select: { name: true } } },
  });

  const base = `/admin/businesses/${business.id}/data/download`;

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Import and export</h1>
          <p className="admin__subtitle">
            Export, edit prices in the spreadsheet, re-import. Items are matched on their code,
            so edits update in place — and the QR never changes.
          </p>
        </div>
        <Link
          href={`/admin/businesses/${business.id}`}
          className="admin__button admin__button--secondary"
        >
          Back to business
        </Link>
      </header>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Download</h2>
        <div className="admin__actions">
          <a className="admin__button admin__button--secondary" href={`${base}?kind=template`}>
            Excel template
          </a>
          <a className="admin__button" href={`${base}?audience=admin&format=xlsx`}>
            Export menu (.xlsx)
          </a>
          <a className="admin__button admin__button--secondary" href={`${base}?audience=admin&format=csv`}>
            Export menu (.csv)
          </a>
          <a
            className="admin__button admin__button--secondary"
            href={`${base}?audience=client&format=xlsx`}
          >
            Client copy (no internal codes)
          </a>
        </div>
      </section>

      <ImportWizard
        businessId={business.id}
        publicId={business.publicId}
        menuKeys={business.menus.map((menu) => menu.key)}
        preview={previewImportAction.bind(null, business.id)}
        confirm={confirmImportAction.bind(null, business.id, business.publicId)}
      />

      <ImageZipImporter
        preview={previewImageZipAction.bind(null, business.id)}
        confirm={confirmImageZipAction.bind(null, business.id, business.publicId)}
      />

      <section className="admin__panel">
        <h2 className="admin__panel-title">Import history</h2>
        {batches.length === 0 ? (
          <p className="admin__empty">No imports yet.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">File</th>
                  <th scope="col">By</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="admin__numeric">Created</th>
                  <th scope="col" className="admin__numeric">Updated</th>
                  <th scope="col" className="admin__numeric">Errors</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} data-batch={batch.id}>
                    <td>{batch.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
                    <td>{batch.fileName}</td>
                    <td>{batch.user?.name ?? '—'}</td>
                    <td>{batch.status}</td>
                    <td className="admin__numeric">{batch.createdRows}</td>
                    <td className="admin__numeric">{batch.updatedRows}</td>
                    <td className="admin__numeric">{batch.errorRows}</td>
                    <td>
                      <div className="admin__actions">
                        {batch.errorRows > 0 ? (
                          <a
                            className="admin__button admin__button--secondary"
                            href={`${base}?kind=errors&batch=${batch.id}`}
                          >
                            Error report
                          </a>
                        ) : null}
                        {batch.status === 'COMPLETED' ? (
                          <RollbackButton
                            businessId={business.id}
                            batchId={batch.id}
                            publicId={business.publicId}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function RollbackButton({
  businessId,
  batchId,
  publicId,
}: {
  businessId: string;
  batchId: string;
  publicId: string;
}) {
  return (
    <ActionButton
      action={rollbackImportAction.bind(null, businessId, batchId, publicId)}
      label="Roll back"
      variant="danger"
      confirm="Restore every item this import changed to its previous values?"
    />
  );
}
