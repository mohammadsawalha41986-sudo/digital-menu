'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { prisma } from '@/server/db/client';
import { TenantAccessError, requireTenantContext } from '@/server/tenancy/context';
import { invalidateProfile } from '@/server/profile/cache';
import {
  createBusiness,
  updateBusiness,
  updateTemplate,
  publishMenu,
} from '@/server/admin/business-service';
import { uploadMedia, assignMedia } from '@/server/media/service';
import { analyseLogo, applyBrandPreset } from '@/server/brand/service';
import { DEFAULT_TEMPLATE_KEY } from '@/templates/registry';
import { ValidationError } from '@/server/admin/business-service';
import { planMenuText, saveMenuText, type PastePlan } from './menu-text-import';
import type { ActionState } from './actions';

/**
 * The guided creation flow.
 *
 * Every action here delegates to a service that already existed. Nothing in
 * this file writes to the database directly, defines a second media path, or
 * knows how a QR code is drawn — it is a different door onto the same house.
 *
 * What it does own is *hiding the architecture*: slugs, keys, template
 * families, layout variants and media ids never appear in the interface. They
 * are derived here from what a restaurant owner actually typed.
 */

async function run(work: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await work();
    return { ok: true, message: message ?? undefined };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    if (error instanceof Error) return { error: error.message };
    throw error;
  }
}

/**
 * Turns a restaurant's name into a usable handle.
 *
 * Arabic names transliterate to nothing useful, so a name with no Latin
 * characters falls back to a short random handle rather than an empty string.
 * The customer never sees either.
 */
function deriveSlug(name: string, fallback: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  return slug.length >= 2 ? slug : `menu-${fallback}`;
}

async function uniqueSlug(base: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await prisma.business.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!taken) return candidate;
  }

  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

/** Step 1 — the only screen before a business exists. */
export async function createProjectAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const nameAr = String(formData.get('nameAr') ?? '').trim();
  const nameEn = String(formData.get('nameEn') ?? '').trim();
  const display = String(formData.get('displayName') ?? '').trim();

  // One of the two names is enough to start. Arabic is the primary language,
  // so an owner who typed only English still gets a valid record: the display
  // name fills the required Arabic field rather than blocking them on a
  // translation the platform must never invent.
  const arabic = nameAr || display;
  const english = nameEn || (arabic === display ? '' : display);

  if (!arabic) return { error: 'Enter the restaurant name to continue.' };

  let businessId = '';

  const state = await run(async () => {
    const slug = await uniqueSlug(deriveSlug(english || display || arabic, Date.now().toString(36).slice(-4)));

    const business = await createBusiness(user, {
      nameAr: arabic,
      nameEn: english || null,
      slug,
      type: String(formData.get('type') ?? 'RESTAURANT'),
      // Created as a draft: nothing is public until the owner presses publish.
      status: 'DRAFT',
      defaultLocale: 'ar',
      currency: String(formData.get('currency') ?? 'SAR'),
    } as Parameters<typeof createBusiness>[1]);

    businessId = business.id;
  });

  if (state.error) return state;

  revalidatePath('/admin/businesses');
  redirect(`/admin/build/${businessId}/brand`);
}

async function revalidateBuild(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { publicId: true },
  });

  revalidatePath(`/admin/build/${businessId}`, 'layout');
  revalidatePath(`/admin/businesses/${businessId}/preview`);

  if (business) {
    revalidatePath(`/m/${business.publicId}`);
    invalidateProfile(business.publicId);
  }
}

/**
 * Step 2 — a logo becomes a brand.
 *
 * Upload, assign as the logo, measure the identity and apply it, in one act.
 * The spec is explicit that the owner should not be asked to type colours, so
 * the only thing this asks for is the image.
 */
export async function uploadLogoAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  return run(async () => {
    let mediaId = String(formData.get('mediaId') ?? '');

    if (!mediaId) {
      const file = formData.get('file');
      if (!(file instanceof File) || file.size === 0) {
        return 'Choose an image file first.';
      }

      const media = await uploadMedia(user, businessId, {
        kind: 'LOGO',
        altEn: 'Logo',
        upload: {
          fileName: file.name,
          declaredContentType: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        },
      });

      mediaId = media.id;
    }

    await assignMedia(user, businessId, mediaId, { type: 'business-logo' });

    const { identity } = await analyseLogo(user, businessId, mediaId);
    await applyBrandPreset(user, businessId);
    await revalidateBuild(businessId);

    if (identity.fromLogo) return 'Brand identity built from your logo';

    // The upload succeeded, so this is not an error — but it is not a success
    // either, and reporting it in the same green as a measured palette would
    // tell an owner their brand came from their logo when it did not.
    throw new ValidationError(
      identity.note ?? 'That image gave no colours; the palette is the platform default.',
    );
  });
}

/** Step 3 — a visual style, expressed as a template family plus a menu theme. */
export async function chooseStyleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  return run(async () => {
    // One design for every restaurant; the choice left is the photo layout.
    // `updateTemplate` rejects a layout the design does not offer.
    await updateTemplate(user, businessId, {
      templateKey: DEFAULT_TEMPLATE_KEY,
      variantKey: String(formData.get('variantKey') ?? ''),
    });

    await revalidateBuild(businessId);
    return 'Photo layout saved';
  });
}

/** Steps 4 and 9 — description, contact and the links a visitor can act on. */
export async function saveDetailsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  return run(async () => {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        nameAr: true,
        nameEn: true,
        slug: true,
        type: true,
        status: true,
        defaultLocale: true,
        currency: true,
      },
    });

    if (!business) throw new TenantAccessError('No such business');

    const text = (name: string) => {
      const value = formData.get(name);
      if (value === null) return undefined;
      const trimmed = String(value).trim();
      return trimmed === '' ? null : trimmed;
    };

    await updateBusiness(user, businessId, {
      ...business,
      ...(text('descriptionAr') !== undefined ? { descriptionAr: text('descriptionAr') } : {}),
      ...(text('descriptionEn') !== undefined ? { descriptionEn: text('descriptionEn') } : {}),
      ...(text('phone') !== undefined ? { phone: text('phone') } : {}),
      ...(text('whatsapp') !== undefined ? { whatsapp: text('whatsapp') } : {}),
      ...(text('email') !== undefined ? { email: text('email') } : {}),
      ...(text('website') !== undefined ? { website: text('website') } : {}),
      ...(text('instagram') !== undefined ? { instagram: text('instagram') } : {}),
      ...(text('tiktok') !== undefined ? { tiktok: text('tiktok') } : {}),
      ...(text('facebook') !== undefined ? { facebook: text('facebook') } : {}),
      ...(text('youtube') !== undefined ? { youtube: text('youtube') } : {}),
      ...(text('linkedin') !== undefined ? { linkedin: text('linkedin') } : {}),
      ...(text('googleMapsUrl') !== undefined ? { googleMapsUrl: text('googleMapsUrl') } : {}),
      ...(text('addressAr') !== undefined ? { addressAr: text('addressAr') } : {}),
      ...(text('addressEn') !== undefined ? { addressEn: text('addressEn') } : {}),
    } as Parameters<typeof updateBusiness>[2]);

    await revalidateBuild(businessId);
    return 'Saved';
  });
}

/**
 * Step 5, the paste path.
 *
 * A restaurant's menu usually exists as text long before it exists as a
 * spreadsheet. `intent=preview` reads it and says what would happen, line
 * by line; `intent=save` does exactly that. See `menu-text-import.ts`.
 */
export interface PasteState extends ActionState {
  plan?: PastePlan;
  saved?: boolean;
}

export async function pasteMenuAction(_previous: PasteState, formData: FormData): Promise<PasteState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');
  const text = String(formData.get('menuText') ?? '').trim();
  if (!text) return { error: 'Paste your menu first.' };
  const save = formData.get('intent') === 'save';

  try {
    const plan = save ? await saveMenuText(user, businessId, text) : await planMenuText(user, businessId, text);
    const dishes = plan.counts.new + plan.counts.update + plan.counts.same;
    if (dishes === 0) {
      return { error: 'Nothing could be read from that text.', plan };
    }
    if (save) await revalidateBuild(businessId);
    const sections = plan.sections.length;
    const summary = save
      ? `${plan.counts.new} items added, ${plan.counts.update} updated across ${sections} ${sections === 1 ? 'section' : 'sections'}`
      : `Ready: ${plan.counts.new} new, ${plan.counts.update} to update, ${plan.counts.same} unchanged`;
    const skipped = plan.problems.length > 0 ? ` · ${plan.problems.length} ${plan.problems.length === 1 ? 'line' : 'lines'} not read` : '';
    return { ok: true, message: summary + skipped, plan, saved: save };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}

/** Step 10 — the one act that makes a menu public. */
export async function publishProjectAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  return run(async () => {
    const context = await requireTenantContext(user, businessId, 'EDITOR');

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: context.businessId },
      select: {
        nameAr: true,
        nameEn: true,
        slug: true,
        type: true,
        defaultLocale: true,
        currency: true,
      },
    });

    const menus = await prisma.menu.findMany({
      where: { businessId: context.businessId },
      select: { id: true, key: true, categories: { select: { items: { select: { id: true } } } } },
    });

    const withItems = menus.filter((menu) =>
      menu.categories.some((category) => category.items.length > 0),
    );

    if (withItems.length === 0) {
      return 'Add at least one item before publishing.';
    }

    // Publishing a version is what a QR resolves to; the business going ACTIVE
    // is what makes the URL answer at all. Both, in that order.
    for (const menu of withItems) {
      await publishMenu(user, businessId, menu.id);
    }

    await updateBusiness(user, businessId, {
      ...business,
      status: 'ACTIVE',
    } as Parameters<typeof updateBusiness>[2]);

    await revalidateBuild(businessId);
    return 'Published';
  });
}

/** Saving a draft is explicit, so the button is honest about doing nothing new. */
export async function saveDraftAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const businessId = String(formData.get('businessId') ?? '');
  await revalidateBuild(businessId);

  return { ok: true, message: 'Draft saved — nothing is public until you publish' };
}
