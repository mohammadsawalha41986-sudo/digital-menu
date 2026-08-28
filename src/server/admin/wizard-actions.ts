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
  createMenu,
  createCategory,
  upsertItem,
  publishMenu,
} from '@/server/admin/business-service';
import { uploadMedia, assignMedia } from '@/server/media/service';
import { analyseLogo, applyBrandPreset } from '@/server/brand/service';
import { updateMenuDesign } from '@/server/menu-studio/design';
import { ValidationError } from '@/server/admin/business-service';
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
    const templateKey = String(formData.get('templateKey') ?? '');
    const themeKey = String(formData.get('themeKey') ?? '');

    await updateTemplate(user, businessId, { templateKey, variantKey: 'a' });

    // The menu theme travels with the style so the two never disagree. Menus
    // that do not exist yet inherit it when they are created.
    if (themeKey) {
      const menus = await prisma.menu.findMany({
        where: { businessId },
        select: { id: true },
      });

      for (const menu of menus) {
        await updateMenuDesign(user, businessId, menu.id, { themeKey, layoutKey: 'a' });
      }
    }

    await revalidateBuild(businessId);
    return 'Style applied';
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
 * spreadsheet. Lines are read as `Category | Item | Price | Description`, and
 * a line with no pipe is treated as a category heading — which is how people
 * actually type a menu.
 */
export async function pasteMenuAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  return run(async () => {
    const context = await requireTenantContext(user, businessId, 'EDITOR');
    const text = String(formData.get('menuText') ?? '').trim();
    if (!text) return 'Paste your menu first.';

    const menu =
      (await prisma.menu.findFirst({
        where: { businessId: context.businessId },
        select: { id: true, key: true },
      })) ??
      (await createMenu(user, businessId, {
        key: 'main',
        titleAr: 'المنيو',
        titleEn: 'Menu',
        status: 'ACTIVE',
        sortOrder: 0,
      }));

    let categoryKey = '';
    let created = 0;
    let categories = 0;

    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;

      const parts = line.split('|').map((part) => part.trim());

      if (parts.length < 2) {
        // A bare line is a section heading.
        const name = parts[0] ?? '';
        if (!name) continue;

        categoryKey = `cat-${categories + 1}`;
        await createCategory(user, businessId, menu.id, {
          key: categoryKey,
          nameAr: name,
          nameEn: null,
          descriptionAr: null,
          descriptionEn: null,
          sortOrder: categories,
          isActive: true,
          isFeatured: false,
        });
        categories += 1;
        continue;
      }

      if (!categoryKey) {
        categoryKey = 'cat-1';
        await createCategory(user, businessId, menu.id, {
          key: categoryKey,
          nameAr: 'المنيو',
          nameEn: 'Menu',
          descriptionAr: null,
          descriptionEn: null,
          sortOrder: 0,
          isActive: true,
          isFeatured: false,
        });
        categories += 1;
      }

      const [first, second, third, fourth] = parts;

      // Two shapes are accepted: "Category | Item | Price | Description" and
      // "Item | Price | Description" under the heading above it.
      const looksCategorised = parts.length >= 3 && /\d/.test(third ?? '');
      const name = looksCategorised ? (second ?? '') : (first ?? '');
      const price = looksCategorised ? (third ?? '') : (second ?? '');
      const description = looksCategorised ? (fourth ?? '') : (third ?? '');

      if (!name) continue;

      created += 1;
      await upsertItem(user, businessId, {
        itemCode: `P-${String(created).padStart(3, '0')}`,
        categoryKey,
        nameAr: name,
        nameEn: null,
        descriptionAr: description || null,
        descriptionEn: null,
        // Raw text: the service converts it with the business's own currency,
        // which is the only place that knows how many minor digits it has.
        price,
        calories: null,
        servingSizeAr: null,
        servingSizeEn: null,
        ingredientsAr: null,
        ingredientsEn: null,
        allergens: [],
        tags: [],
        availability: 'AVAILABLE',
        isFeatured: false,
        sortOrder: created,
      });
    }

    await revalidateBuild(businessId);

    if (created === 0) return 'Nothing could be read from that text.';
    return `${created} items added across ${categories} ${categories === 1 ? 'section' : 'sections'}`;
  });
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
