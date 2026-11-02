'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { prisma } from '@/server/db/client';
import { invalidateProfile } from '@/server/profile/cache';
import { TenantAccessError } from '@/server/tenancy/context';
import { ValidationError } from './business-service';
import { copyItemsTo } from './structure-service';
import {
  createDish,
  createSection,
  deleteSection,
  deleteDishes,
  deleteMenu,
  ItemConflictError,
  menuImpact,
  moveDishes,
  reorderDishes,
  restoreDeletedRecord,
  updateDish,
  type ItemPatch,
  type ItemView,
  type MenuImpact,
} from '@/server/menu-manage/service';

/**
 * The menu manager's actions. Each one checks the user, does one thing, clears
 * the public menu's cache, and returns something the screen can show. A save
 * that finds the dish changed by someone else comes back as `conflict`, with
 * the version that is there now.
 */

export type SaveDishResult =
  | { ok: true; item: ItemView }
  | { ok: false; conflict: true; current: ItemView }
  | { ok: false; error: string };

export type PlainResult = { ok: true; message: string; recordId?: string; count?: number } | { ok: false; error: string };

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof ValidationError) return { ok: false, error: error.message };
  if (error instanceof TenantAccessError) return { ok: false, error: 'Not found, or you do not have permission for this.' };
  console.error('[admin] menu manager action failed', error);
  return { ok: false, error: 'Something went wrong. Nothing was changed. Try again.' };
}

async function refresh(businessId: string): Promise<void> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { publicId: true } });
  if (business) invalidateProfile(business.publicId);
  revalidatePath(`/admin/businesses/${businessId}/manage`);
  revalidatePath(`/admin/businesses/${businessId}/menus`);
}

export async function saveDishAction(
  businessId: string,
  itemId: string,
  patch: ItemPatch,
  expectedUpdatedAt: string | null,
): Promise<SaveDishResult> {
  const user = await requireUser();
  try {
    const item = await updateDish(user, businessId, itemId, patch, expectedUpdatedAt);
    await refresh(businessId);
    return { ok: true, item };
  } catch (error) {
    if (error instanceof ItemConflictError) return { ok: false, conflict: true, current: error.current };
    return failure(error);
  }
}

export async function createDishAction(
  businessId: string,
  input: {
    categoryId?: string | null;
    newSection?: string | null;
    nameAr: string;
    nameEn?: string;
    price?: string;
    availability?: 'AVAILABLE' | 'UNAVAILABLE' | 'HIDDEN' | 'SEASONAL';
  },
): Promise<{ ok: true; item: ItemView } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    const item = await createDish(user, businessId, input);
    await refresh(businessId);
    return { ok: true, item };
  } catch (error) {
    return failure(error);
  }
}

export async function createSectionAction(
  businessId: string,
  input: { nameAr: string; nameEn?: string; menuId?: string | null },
): Promise<PlainResult> {
  const user = await requireUser();
  try {
    const section = await createSection(user, businessId, input);
    await refresh(businessId);
    revalidatePath(`/admin/build/${businessId}`, 'layout');
    return {
      ok: true,
      message: section.menuCreated
        ? `Added the section “${section.nameAr}”, and created your menu for it.`
        : `Added the section “${section.nameAr}”.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteSectionAction(businessId: string, categoryId: string): Promise<PlainResult> {
  const user = await requireUser();
  try {
    await deleteSection(user, businessId, categoryId);
    await refresh(businessId);
    return { ok: true, message: 'Section removed.' };
  } catch (error) {
    return failure(error);
  }
}

export async function reorderDishesAction(businessId: string, categoryId: string, orderedIds: string[]): Promise<PlainResult> {
  const user = await requireUser();
  try {
    await reorderDishes(user, businessId, categoryId, orderedIds);
    await refresh(businessId);
    return { ok: true, message: 'Order saved' };
  } catch (error) {
    return failure(error);
  }
}

export async function moveDishesAction(businessId: string, itemIds: string[], targetCategoryId: string): Promise<PlainResult> {
  const user = await requireUser();
  try {
    const count = await moveDishes(user, businessId, itemIds, targetCategoryId);
    await refresh(businessId);
    return { ok: true, message: count === 1 ? 'Moved 1 dish' : `Moved ${count} dishes`, count };
  } catch (error) {
    return failure(error);
  }
}

export async function copyDishesAction(businessId: string, itemIds: string[], targetCategoryId: string): Promise<PlainResult> {
  const user = await requireUser();
  try {
    const { count } = await copyItemsTo(user, businessId, itemIds, targetCategoryId);
    await refresh(businessId);
    return { ok: true, message: count === 1 ? 'Copied 1 dish. The copy is hidden until you show it.' : `Copied ${count} dishes. The copies are hidden until you show them.`, count };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteDishesAction(businessId: string, itemIds: string[]): Promise<PlainResult> {
  const user = await requireUser();
  try {
    const { recordId, count } = await deleteDishes(user, businessId, itemIds);
    await refresh(businessId);
    return { ok: true, recordId, count, message: `Deleted ${count} ${count === 1 ? 'dish' : 'dishes'}. You can restore them below.` };
  } catch (error) {
    return failure(error);
  }
}

export async function menuImpactAction(businessId: string, menuId: string): Promise<{ ok: true; impact: MenuImpact } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    return { ok: true, impact: await menuImpact(user, businessId, menuId) };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteMenuAction(businessId: string, menuId: string, confirmation: string): Promise<PlainResult> {
  const user = await requireUser();
  try {
    const { recordId, impact } = await deleteMenu(user, businessId, menuId, confirmation);
    await refresh(businessId);
    return {
      ok: true,
      recordId,
      message: `Deleted "${impact.title}" with ${impact.dishes} dishes. You can restore it below.`,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function restoreDeletedAction(businessId: string, recordId: string): Promise<PlainResult> {
  const user = await requireUser();
  try {
    await restoreDeletedRecord(user, businessId, recordId);
    await refresh(businessId);
    return { ok: true, message: 'Restored' };
  } catch (error) {
    return failure(error);
  }
}
