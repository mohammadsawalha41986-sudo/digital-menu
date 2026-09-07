'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { TenantAccessError } from '@/server/tenancy/context';
import { ValidationError } from './business-service';
import {
  duplicateCategory,
  duplicateItem,
  duplicateMenu,
  move,
  reorder,
  type ReorderScope,
} from './structure-service';
import type { ActionState } from './actions';

/**
 * Server actions for duplication and ordering.
 *
 * Thin, as the others are: parse, call the service, revalidate. Authorisation
 * and the tenant check live in the service, so invoking an action directly
 * cannot skip them.
 */

function refresh(businessId: string) {
  revalidatePath(`/admin/businesses/${businessId}`, 'layout');
  revalidatePath('/admin/businesses');
  revalidatePath('/admin');
}

async function run(businessId: string, work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    refresh(businessId);
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}

export async function duplicateMenuAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');
  const menuId = String(formData.get('menuId') ?? '');

  return run(businessId, async () => {
    const copy = await duplicateMenu(user, businessId, menuId);
    return `Duplicated as “${copy.titleEn ?? copy.titleAr}” (${copy.key}). It is a draft — publish it when it is ready.`;
  });
}

export async function duplicateCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');
  const categoryId = String(formData.get('categoryId') ?? '');

  return run(businessId, async () => {
    const copy = await duplicateCategory(user, businessId, categoryId);
    return `Duplicated the section as “${copy.nameEn ?? copy.nameAr}”.`;
  });
}

export async function duplicateItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');
  const itemId = String(formData.get('itemId') ?? '');

  return run(businessId, async () => {
    const copy = await duplicateItem(user, businessId, itemId);
    return `Duplicated as ${copy.itemCode}. It is hidden until you show it.`;
  });
}

const SCOPES = new Set<ReorderScope>(['menu', 'category', 'item']);

function parseScope(value: FormDataEntryValue | null): ReorderScope {
  const scope = String(value ?? '');
  if (!SCOPES.has(scope as ReorderScope)) throw new ValidationError('Unknown thing to reorder.');
  return scope as ReorderScope;
}

/** The up/down buttons. Works with no JavaScript at all. */
export async function moveAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');
  const direction = formData.get('direction') === 'up' ? 'up' : 'down';

  return run(businessId, async () => {
    const scope = parseScope(formData.get('scope'));
    const result = await move(user, businessId, scope, String(formData.get('id') ?? ''), direction);
    return result.moved > 0 ? 'Order updated.' : 'Already at the end.';
  });
}

/** Drag-and-drop's commit: the whole new order in one write. */
export async function reorderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const businessId = String(formData.get('businessId') ?? '');

  return run(businessId, async () => {
    const scope = parseScope(formData.get('scope'));
    const parentId = (formData.get('parentId') as string | null) || null;
    const ids = String(formData.get('order') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const result = await reorder(user, businessId, scope, parentId, ids);
    return `Order updated (${result.moved}).`;
  });
}
