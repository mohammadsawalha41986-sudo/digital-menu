import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { renderQr, type QrArtwork } from '@/server/qr/service';

export const dynamic = 'force-dynamic';

/**
 * QR management (master spec §12, §13).
 *
 * Every code on this page is rendered from the business's permanent public
 * identifier at request time, so what staff download is always exactly what a
 * previously printed code already encodes. Validation runs before the download
 * links are offered, and a palette that would not scan is reported rather than
 * quietly corrected.
 */
export default async function QrPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const targets = [
    { key: null as string | null, label: 'Business profile', name: business.nameEn ?? business.nameAr },
    ...business.branches.map((branch) => ({
      key: branch.key,
      label: `Branch — ${branch.nameEn ?? branch.nameAr}`,
      name: branch.nameEn ?? branch.nameAr,
    })),
  ];

  const artworks: { style: QrArtwork; label: string }[] = [
    { style: 'plain', label: 'QR only' },
    { style: 'with-name', label: 'QR + business name' },
    { style: 'with-prompt', label: 'QR + scan prompt' },
  ];

  const rendered = await Promise.all(
    targets.flatMap((target) =>
      artworks.map(async (artwork) => {
        const result = await renderQr({
          publicId: business.publicId,
          branchKey: target.key,
          artwork: artwork.style,
          captionPrimary: artwork.style === 'plain' ? null : target.name,
          captionSecondary: artwork.style === 'with-prompt' ? 'Scan to view the menu' : null,
        });

        return { target, artwork, result };
      }),
    ),
  );

  const downloadBase = `/admin/businesses/${business.id}/qr/download`;

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">QR codes</h1>
          <p className="admin__subtitle">
            Permanent. Reprinting different artwork does not invalidate anything already on a
            table — every style below encodes the identical destination.
          </p>
        </div>
        <Link
          href={`/admin/businesses/${business.id}`}
          className="admin__button admin__button--secondary"
        >
          Back to business
        </Link>
      </header>

      {targets.map((target) => {
        const forTarget = rendered.filter((entry) => entry.target.key === target.key);
        const destination = forTarget[0]?.result.destination ?? '';
        const validation = forTarget[0]?.result.validation;

        return (
          <section className="admin__panel" key={target.key ?? 'business'}>
            <h2 className="admin__panel-title">{target.label}</h2>
            <p className="admin__destination">{destination}</p>

            {validation && validation.issues.length > 0 ? (
              <div>
                {validation.issues.map((issue) => (
                  <p
                    key={issue.code}
                    className={`admin__message admin__message--${issue.level === 'error' ? 'error' : 'warning'}`}
                    role={issue.level === 'error' ? 'alert' : 'status'}
                  >
                    {issue.message}
                  </p>
                ))}
              </div>
            ) : (
              <p className="admin__message admin__message--ok" role="status">
                Readability checks passed (contrast {validation?.contrast.toFixed(1)}:1, quiet zone
                and print size within limits).
              </p>
            )}

            <div className="admin__qr-grid">
              {forTarget.map(({ artwork, result }) => {
                const query = new URLSearchParams({ artwork: artwork.style });
                if (target.key) query.set('branch', target.key);

                return (
                  <div className="admin__qr-preview" key={artwork.style}>
                    <span className="admin__metric-label">{artwork.label}</span>
                    {/* Rendered server-side from our own generator; no external input. */}
                    <div dangerouslySetInnerHTML={{ __html: result.svg }} />
                    <div className="admin__actions">
                      <a
                        className="admin__button admin__button--secondary"
                        href={`${downloadBase}?${query.toString()}&format=svg`}
                      >
                        SVG
                      </a>
                      <a
                        className="admin__button admin__button--secondary"
                        href={`${downloadBase}?${query.toString()}&format=png`}
                      >
                        PNG
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
