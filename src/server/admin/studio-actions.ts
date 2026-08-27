'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { prisma } from '@/server/db/client';
import { TenantAccessError } from '@/server/tenancy/context';
import { invalidateProfile } from '@/server/profile/cache';
import { updateMenuDesign } from '@/server/menu-studio/design';
import { saveModifierGroup, setItemModifiers, deleteModifierGroup } from '@/server/menu-studio/modifiers';
import { analyseLogo, applyBrandPreset, overrideBrandPreset } from '@/server/brand/service';
import type { ActionState } from './actions';

/**
 * Server actions for the Menu Studio.
 *
 * Same shape as the rest of the admin: real forms bound to server actions, so
 * every control works without JavaScript and the client boundary exists only
 * for pending state. A studio that needs a working drag-and-drop to save a
 * price is a studio that fails on a tablet in a kitchen.
 */

async function run(work: () => Promise<string>): Promise<ActionState> {
  try {
    return { ok: true, message: await work() };
  } catch (error) {
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    if (error instanceof Error) return { error: error.message };
    throw error;
  }
}

/** Design changes alter presentation only, but the public page still caches it. */
async function revalidateStudio(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { publicId: true },
  });

  revalidatePath(`/admin/businesses/${businessId}/studio`, 'layout');

  if (business) {
    revalidatePath(`/m/${business.publicId}`);
    invalidateProfile(business.publicId);
  }
}

export async function updateDesignAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');
  const menuId = String(formData.get('menuId') ?? '');

  return run(async () => {
    const optional = (name: string) => {
      const value = formData.get(name);
      if (value === null) return undefined;
      const text = String(value);
      // An empty select means "use the theme's own choice", which is a real
      // value, not a missing one.
      return text === '' ? null : text;
    };

    await updateMenuDesign(user, businessId, menuId, {
      ...(formData.has('themeKey') ? { themeKey: String(formData.get('themeKey')) } : {}),
      ...(formData.has('layoutKey') ? { layoutKey: String(formData.get('layoutKey')) } : {}),
      ...(formData.has('fontHeading') ? { fontHeading: optional('fontHeading') } : {}),
      ...(formData.has('fontBody') ? { fontBody: optional('fontBody') } : {}),
      ...(formData.has('fontPrice') ? { fontPrice: optional('fontPrice') } : {}),
      ...(formData.has('fontAccent') ? { fontAccent: optional('fontAccent') } : {}),
      ...(formData.has('imageStyle') ? { imageStyle: optional('imageStyle') } : {}),
      ...(formData.has('density') ? { density: optional('density') } : {}),
      showPrices: formData.get('showPrices') === 'on',
      showImages: formData.get('showImages') === 'on',
      showCalories: formData.get('showCalories') === 'on',
    });

    await revalidateStudio(businessId);
    return 'Design saved';
  });
}

export async function analyseLogoAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');
  const mediaId = String(formData.get('mediaId') ?? '');

  return run(async () => {
    const { preset, identity } = await analyseLogo(user, businessId, mediaId);
    await revalidateStudio(businessId);

    if (!identity.fromLogo) {
      // The engine could not measure a brand. Say so here rather than let the
      // operator believe the defaults on screen came from their logo.
      return identity.note ?? 'No colours could be measured from that image.';
    }

    return `Measured ${preset.extractedColors.length} colours from the logo`;
  });
}

export async function overrideBrandAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  return run(async () => {
    const text = (name: string) => {
      const value = formData.get(name);
      return value === null || String(value) === '' ? undefined : String(value);
    };

    const tone = text('tone');

    await overrideBrandPreset(user, businessId, {
      ...(text('primary') ? { primary: text('primary')! } : {}),
      ...(text('secondary') ? { secondary: text('secondary')! } : {}),
      ...(text('accent') ? { accent: text('accent')! } : {}),
      ...(tone === 'dark' || tone === 'light' ? { tone } : {}),
      ...(text('fontHeading') ? { fontHeading: text('fontHeading')! } : {}),
      ...(text('fontBody') ? { fontBody: text('fontBody')! } : {}),
      ...(text('fontPrice') ? { fontPrice: text('fontPrice')! } : {}),
      ...(text('fontAccent') ? { fontAccent: text('fontAccent')! } : {}),
    });

    await revalidateStudio(businessId);
    return 'Brand identity updated';
  });
}

export async function applyBrandAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  return run(async () => {
    await applyBrandPreset(user, businessId);
    await revalidateStudio(businessId);
    return 'Brand applied to the live menu';
  });
}

export async function saveModifierGroupAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  return run(async () => {
    // Options arrive as parallel arrays from repeated fields, which is what a
    // plain HTML form can express without scripting.
    const keys = formData.getAll('optionKey').map(String);
    const namesAr = formData.getAll('optionNameAr').map(String);
    const namesEn = formData.getAll('optionNameEn').map(String);
    const deltas = formData.getAll('optionDelta').map(String);

    const options = keys
      .map((key, index) => ({
        key: key.trim(),
        nameAr: (namesAr[index] ?? '').trim(),
        nameEn: (namesEn[index] ?? '').trim() || null,
        priceDeltaMinor: Math.round(Number(deltas[index] ?? '0') * 100) || 0,
      }))
      .filter((option) => option.key !== '' && option.nameAr !== '');

    await saveModifierGroup(user, businessId, {
      key: String(formData.get('key') ?? '').trim(),
      nameAr: String(formData.get('nameAr') ?? '').trim(),
      nameEn: String(formData.get('nameEn') ?? '').trim() || null,
      minSelect: Number(formData.get('minSelect') ?? 0),
      maxSelect: Number(formData.get('maxSelect') ?? 1),
      options,
    });

    await revalidateStudio(businessId);
    return 'Modifier group saved';
  });
}

export async function deleteModifierGroupAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  return run(async () => {
    await deleteModifierGroup(user, businessId, String(formData.get('key') ?? ''));
    await revalidateStudio(businessId);
    return 'Modifier group deleted';
  });
}

export async function setItemModifiersAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  return run(async () => {
    await setItemModifiers(
      user,
      businessId,
      String(formData.get('itemCode') ?? ''),
      formData.getAll('groupKey').map(String).filter(Boolean),
    );

    await revalidateStudio(businessId);
    return 'Item modifiers saved';
  });
}
