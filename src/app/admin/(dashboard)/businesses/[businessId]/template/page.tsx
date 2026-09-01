import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { updateTemplateAction } from '@/server/admin/actions';
import { SUGGESTED_TEMPLATES, listTemplates } from '@/templates/registry';
import { TemplateForm } from './template-form';

export const dynamic = 'force-dynamic';

/**
 * Template picker with device previews (master spec §148).
 *
 * The previews are iframes of the *real* public profile at the three target
 * widths — not mockups. Staff compare what a visitor will actually get.
 */
export default async function TemplatePage({
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

  // Families the spec associates with this business type come first. A
  // suggestion, never a restriction — any business may use any template (§16).
  const suggested = SUGGESTED_TEMPLATES[business.type] ?? [];
  const ordered = [...listTemplates()].sort((a, b) => {
    const rank = (key: string) => {
      const index = suggested.indexOf(key);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return rank(a.key) - rank(b.key);
  });

  const templates = ordered.map((template) => ({
    key: template.key,
    label: template.label,
    description: template.description,
    variants: template.variants.map((variant) => ({
      key: variant.key,
      label: variant.label,
      description: variant.description,
    })),
  }));

  // The staff preview route, not the public one. `/m/{publicId}` serves only
  // an ACTIVE business with a published menu, so framing it meant three 404s
  // for any business still being built — which is precisely when a template is
  // chosen. This route runs the *same* renderer, and can additionally see
  // drafts and unpublished menus.
  const previewUrl = `/admin/preview/${business.id}`;

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Template</h1>
          <p className="admin__subtitle">
            Structure only. Switching template changes presentation — never the business id,
            the public URL, the QR, menu data, offers or analytics history.
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
        <h2 className="admin__panel-title">Choose a template</h2>
        <TemplateForm
          templates={templates}
          currentTemplate={business.templateKey}
          currentVariant={business.variantKey}
          action={updateTemplateAction.bind(null, business.id, business.publicId)}
        />
      </section>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Preview</h2>
        <p className="admin__hint">
          Live public profile at each target width. Arabic renders right-to-left; use the
          language switch inside the frame to compare.
        </p>
        <div className="admin__previews">
          <Preview label="Mobile — 390px" url={previewUrl} width={390} height={720} />
          <Preview label="Tablet — 768px" url={previewUrl} width={768} height={720} />
          <Preview label="Desktop — 1200px" url={previewUrl} width={1200} height={720} />
        </div>
      </section>
    </>
  );
}

function Preview({
  label,
  url,
  width,
  height,
}: {
  label: string;
  url: string;
  width: number;
  height: number;
}) {
  return (
    <div className="admin__preview">
      <span className="admin__metric-label">{label}</span>
      <iframe src={url} title={label} width={width} height={height} loading="lazy" />
    </div>
  );
}
