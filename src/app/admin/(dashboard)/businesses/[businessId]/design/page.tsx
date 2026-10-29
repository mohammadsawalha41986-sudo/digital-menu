import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { listMedia } from '@/server/media/service';
import { updateBrandAction, updateTemplateAction } from '@/server/admin/actions';
import { resolveTemplate } from '@/templates/registry';
import { PhotoLayoutPicker } from '../../../photo-layout-picker';
import { BrandForm } from './brand-form';

export const dynamic = 'force-dynamic';

/**
 * Everything about how a menu looks, on one page, in the order an owner
 * decides it: the logo (which sets the colours), then colours and fonts, then
 * how dish photos are laid out. The design itself is shared by every
 * restaurant, so there is nothing else to choose.
 */
export default async function DesignPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const media = await listMedia(user, business.id);
  const logo = media.find((image) => image.id === business.logoMediaId) ?? null;
  const { definition, variant } = resolveTemplate(business.templateKey, business.variantKey);
  const previewUrl = `/admin/preview/${business.id}?lang=ar`;

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">التصميم · Design</h1>
          <p className="admin__subtitle">
            Logo, colours, fonts and photo layout for {business.nameEn ?? business.nameAr}. None of
            this changes the QR code, the link or the menu itself.
          </p>
        </div>
        <Link href={`/admin/businesses/${business.id}`} className="admin__button admin__button--secondary">
          Back to restaurant
        </Link>
      </header>

      <div className="design__layout">
        <div className="design__controls">
          <section className="admin__panel">
            <h2 className="admin__panel-title">1 · الشعار · Logo</h2>
            <div className="design__logo">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo.url} alt="Current logo" className="design__logo-image" />
              ) : (
                <span className="design__logo-empty">No logo yet</span>
              )}
              <div>
                <p className="admin__hint">
                  Uploading a logo measures its colours and picks matching fonts. You can fine-tune
                  them below afterwards.
                </p>
                <Link href={`/admin/build/${business.id}/brand`} className="admin__button">
                  {logo ? 'Change logo' : 'Upload logo'}
                </Link>
              </div>
            </div>
          </section>

          <section className="admin__panel">
            <h2 className="admin__panel-title">2 · الألوان والخطوط · Colours &amp; fonts</h2>
            <BrandForm
              brand={business.brandTheme}
              action={updateBrandAction.bind(null, business.id, business.publicId)}
            />
          </section>

          <section className="admin__panel">
            <h2 className="admin__panel-title">3 · شكل عرض الصور · Photo layout</h2>
            <PhotoLayoutPicker
              businessId={business.id}
              layouts={definition.variants}
              current={variant.key}
              action={updateTemplateAction.bind(null, business.id, business.publicId)}
            />
          </section>
        </div>

        <aside className="design__preview" aria-label="Preview">
          <p className="admin__metric-label">Your menu now · after saving, reload to see changes</p>
          <iframe src={previewUrl} title="Menu preview" width={390} height={760} />
          <Link href={previewUrl} target="_blank" className="admin__button admin__button--secondary">
            Open full preview
          </Link>
        </aside>
      </div>
    </>
  );
}
