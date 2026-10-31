import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { prisma } from '@/server/db/client';
import { getBrandPreset } from '@/server/brand/service';
import { listMedia } from '@/server/media/service';
import { renderQr } from '@/server/qr/service';
import { buildQrDestination } from '@/server/qr/destination';
import { resolveTemplate } from '@/templates/registry';
import { resolveFont } from '@/menu-studio/typography';
import { formatMinorAsDecimal } from '@/lib/money';
import {
  createCategoryAction,
  saveDishAction,
  renameSectionAction,
  moveSectionAction,
  deleteSectionAction,
  deleteDishAction,
  duplicateDishAction,
} from '@/server/admin/actions';
import {
  uploadMediaAction,
  assignMediaAction,
  deleteMediaFormAction,
  uploadDishPhotoAction,
} from '@/server/admin/media-actions';
import { BUILD_STEPS, nextStep, previousStep, stepAt } from '../steps';
import { PreviewPane } from '../preview-pane';
import { BrandStep } from './steps/brand-step';
import { StyleStep } from './steps/style-step';
import { DetailsStep } from './steps/details-step';
import { MenuStep } from './steps/menu-step';
import { ImagesStep } from './steps/images-step';
import { BuilderStep, type BuilderCategory } from './steps/builder-step';
import { QrStep } from './steps/qr-step';
import { ReviewStep } from './steps/review-step';

export const dynamic = 'force-dynamic';

/**
 * One route for the nine steps after creation.
 *
 * Each step reads what it needs from the existing services and hands a plain
 * shape to its component. The live preview sits alongside every one of them,
 * which is the whole point of the flow: an owner should never wonder what
 * their change did.
 */

export default async function BuildStepPage({
  params,
}: {
  params: Promise<{ businessId: string; step: string }>;
}) {
  const { businessId, step: stepKey } = await params;
  const step = stepAt(stepKey);
  if (!step) notFound();

  const user = await requireUser();
  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const menu = await prisma.menu.findFirst({
    where: { businessId: business.id },
    orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    include: {
      categories: {
        orderBy: { sortOrder: 'asc' },
        include: { items: { orderBy: { sortOrder: 'asc' }, include: { image: true } } },
      },
    },
  });

  const items = menu?.categories.flatMap((category) => category.items) ?? [];
  const media = await listMedia(user, business.id);

  // A version string the preview reloads on.
  //
  // It is the latest modification time anywhere in the menu, not just the
  // business row: editing one dish's price leaves the business and the menu
  // untouched, so a coarser key left the preview showing the old price — which
  // is precisely the failure this whole screen exists to prevent.
  const lastTouched = Math.max(
    business.updatedAt.getTime(),
    menu?.updatedAt.getTime() ?? 0,
    ...(menu?.categories.map((category) => category.updatedAt.getTime()) ?? [0]),
    ...items.map((item) => item.updatedAt.getTime()),
  );

  const version = `${lastTouched}-${items.length}-${media.length}`;

  const forward = nextStep(stepKey);
  const back = previousStep(stepKey);

  const content = await renderStep({
    step: stepKey,
    business,
    menu,
    items,
    media,
    user,
  });

  return (
    <>
      <div className="build__main">
        <p className="build__eyebrow">
          Step {step.number} of {BUILD_STEPS[BUILD_STEPS.length - 1]!.number}
        </p>

        {content}

        <nav className="build__nav" aria-label="Step navigation">
          {back ? (
            <Link href={`/admin/build/${business.id}/${back.key}`} className="admin__button admin__button--secondary">
              Back: {back.title}
            </Link>
          ) : (
            <span />
          )}

          {forward ? (
            <Link href={`/admin/build/${business.id}/${forward.key}`} className="admin__button">
              Next: {forward.title}
            </Link>
          ) : null}
        </nav>
      </div>

      <PreviewPane
        businessId={business.id}
        version={version}
        emptyHint={
          items.length === 0
            ? 'Your menu is empty so far — add dishes in step 5 and they appear here immediately.'
            : undefined
        }
      />
    </>
  );
}

/**
 * The shapes the steps read. Written out rather than inferred from the query,
 * because a step should depend on the fields it uses and not on the shape of
 * a `findFirst` three hundred lines away.
 */
interface StepItem {
  itemCode: string;
  updatedAt: Date;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  priceMinor: number | null;
  currency: string;
  calories: number | null;
  availability: string;
  imageMediaId: string | null;
  image: { id: string } | null;
}

interface StepCategory {
  id: string;
  key: string;
  updatedAt: Date;
  nameAr: string;
  nameEn: string | null;
  items: StepItem[];
}

interface StepMenu {
  id: string;
  categories: StepCategory[];
}

type StepContext = {
  step: string;
  business: Awaited<ReturnType<typeof getBusinessForAdmin>>;
  menu: StepMenu | null;
  items: StepItem[];
  media: Awaited<ReturnType<typeof listMedia>>;
  user: Awaited<ReturnType<typeof requireUser>>;
};

async function renderStep(context: StepContext) {
  const { business, media, user } = context;

  const thumbnails = media.map((image) => ({
    id: image.id,
    url: image.url,
    alt: image.altEn ?? image.altAr ?? 'Uploaded image',
    width: image.width,
    height: image.height,
    sizeBytes: image.sizeBytes,
    contentType: image.contentType,
  }));

  // A media id means nothing to an owner; the steps show pictures, so ids are
  // resolved to URLs here and never leave this function.
  const urlOf = (mediaId: string | null) =>
    mediaId === null ? null : (media.find((image) => image.id === mediaId)?.url ?? null);

  switch (context.step) {
    case 'brand': {
      const preset = await getBrandPreset(user, business.id);

      return (
        <BrandStep
          businessId={business.id}
          preset={preset}
          images={thumbnails}
          typographyLabels={{
            heading: resolveFont(preset?.fonts.heading, 'system-serif').label,
            body: resolveFont(preset?.fonts.body, 'system-sans').label,
          }}
        />
      );
    }

    case 'style': {
      const { definition, variant } = resolveTemplate(business.templateKey, business.variantKey);
      return <StyleStep businessId={business.id} layouts={definition.variants} current={variant.key} />;
    }

    case 'details':
    case 'connect':
      return (
        <DetailsStep
          businessId={business.id}
          variant={context.step === 'details' ? 'about' : 'connect'}
          values={{
            descriptionAr: business.descriptionAr ?? '',
            descriptionEn: business.descriptionEn ?? '',
            phone: business.phone ?? '',
            whatsapp: business.whatsapp ?? '',
            email: business.email ?? '',
            website: business.website ?? '',
            googleMapsUrl: business.googleMapsUrl ?? '',
            instagram: business.instagram ?? '',
            facebook: business.facebook ?? '',
            tiktok: business.tiktok ?? '',
            youtube: business.youtube ?? '',
            linkedin: business.linkedin ?? '',
            addressAr: business.addressAr ?? '',
            addressEn: business.addressEn ?? '',
          }}
        />
      );

    case 'menu':
      return (
        <MenuStep
          businessId={business.id}
          itemCount={context.items.length}
          templateUrl={`/admin/businesses/${business.id}/data/template`}
        />
      );

    case 'images':
      return (
        <ImagesStep
          images={thumbnails}
          items={context.items.map((item) => ({
            code: item.itemCode,
            label: item.nameEn ?? item.nameAr,
            currentUrl: urlOf(item.imageMediaId),
          }))}
          uploadMedia={uploadMediaAction.bind(null, business.id, business.publicId)}
          assignMedia={assignMediaAction.bind(null, business.id, business.publicId)}
          deleteMedia={deleteMediaFormAction.bind(null, business.id, business.publicId)}
          bulkDishes={context.items.map((item) => ({
            code: item.itemCode,
            nameAr: item.nameAr,
            nameEn: item.nameEn,
            hasPhoto: Boolean(item.imageMediaId),
          }))}
          uploadDishPhoto={uploadDishPhotoAction.bind(null, business.id, business.publicId)}
        />
      );

    case 'builder': {
      const menu = context.menu;

      const categories: BuilderCategory[] =
        menu?.categories.map((category) => ({
          id: category.id,
          key: category.key,
          name: category.nameAr,
          nameAr: category.nameAr,
          nameEn: category.nameEn ?? '',
          items: category.items.map((item) => ({
            code: item.itemCode,
            nameAr: item.nameAr,
            nameEn: item.nameEn ?? '',
            descriptionAr: item.descriptionAr ?? '',
            price:
              item.priceMinor === null
                ? ''
                : formatMinorAsDecimal(item.priceMinor, item.currency),
            calories: item.calories === null ? '' : String(item.calories),
            categoryKey: category.key,
            availability: item.availability,
            imageUrl: urlOf(item.imageMediaId),
          })),
        })) ?? [];

      if (!menu) {
        return (
          <div className="build__card">
            <h2 className="build__step-title">Add your menu first</h2>
            <p className="admin__hint">
              <Link href={`/admin/build/${business.id}/menu`}>Go back a step</Link> to paste or
              import it — then everything is editable here.
            </p>
          </div>
        );
      }

      return (
        <BuilderStep
          categories={categories}
          currency={business.currency}
          actions={{
            saveItem: saveDishAction.bind(null, business.id, menu.id, business.publicId),
            addCategory: createCategoryAction.bind(null, business.id, menu.id, business.publicId),
            renameCategory: renameSectionAction.bind(null, business.id, business.publicId),
            moveCategory: moveSectionAction.bind(null, business.id, business.publicId),
            deleteCategory: deleteSectionAction.bind(null, business.id, business.publicId),
            deleteItem: deleteDishAction.bind(null, business.id, business.publicId),
            duplicateItem: duplicateDishAction.bind(null, business.id, business.publicId),
          }}
        />
      );
    }

    case 'qr': {
      const qr = await renderQr({ publicId: business.publicId, artwork: 'plain', sizePx: 320 });

      return (
        <QrStep
          publicUrl={buildQrDestination({ publicId: business.publicId })}
          publicPath={`/m/${business.publicId}`}
          qrSvg={qr.svg}
          downloadBase={`/admin/businesses/${business.id}/qr/download`}
          published={business.status === 'ACTIVE'}
        />
      );
    }

    case 'review': {
      const { variant } = resolveTemplate(business.templateKey, business.variantKey);
      const logo = media.find((image) => image.id === business.logoMediaId);

      return (
        <ReviewStep
          businessId={business.id}
          published={business.status === 'ACTIVE'}
          logoUrl={logo?.url ?? null}
          publicUrl={buildQrDestination({ publicId: business.publicId })}
          publicPath={`/m/${business.publicId}`}
          summary={{
            name: business.nameEn ?? business.nameAr,
            style: variant.label,
            categories: context.menu?.categories.length ?? 0,
            items: context.items.length,
            photos: context.items.filter((item) => item.imageMediaId !== null).length,
            priced: context.items.filter((item) => item.priceMinor !== null).length,
          }}
        />
      );
    }

    default:
      notFound();
  }
}
