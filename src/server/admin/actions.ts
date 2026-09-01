'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { invalidateProfile } from '@/server/profile/cache';
import { TenantAccessError } from '@/server/tenancy/context';
import { workingHoursFromForm } from '@/server/business/hours';
import {
  ValidationError,
  createBranch,
  createBusiness,
  createCategory,
  createMenu,
  deleteBranch,
  deleteCategory,
  deleteItem,
  publishMenu,
  updateBrand,
  updateBranch,
  updateBusiness,
  updateCategory,
  updateMenu,
  restoreMenuVersion,
  updateTemplate,
  updateWorkingHours,
  upsertItem,
} from './business-service';
import {
  branchSchema,
  brandSchema,
  businessSchema,
  categorySchema,
  formDataToObject,
  itemSchema,
  menuSchema,
  templateSelectionSchema,
} from './validation';

/**
 * Server actions for the admin UI.
 *
 * These are thin on purpose: parse the form, call the service, revalidate the
 * affected paths. Authorization lives in the service, so a caller cannot skip
 * it by invoking an action directly, and the parsing lives in the schemas, so
 * no action interprets raw form values itself.
 *
 * Every action returns a discriminated result rather than throwing at the UI,
 * because a thrown error in a form submission is a blank page for the operator.
 */

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

/**
 * Wraps a service call, turning the two expected failure kinds into operator
 * text and letting anything unexpected propagate to the error boundary.
 */
async function run(work: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await work();
    return { ok: true, message: message ?? undefined };
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}

/**
 * Refreshes admin views and evicts the business's cached public profile.
 *
 * Over-calling is the safe direction: invalidation is cheap, and a stale price
 * on a customer's menu is not (§114).
 */
function revalidateBusiness(businessId: string, publicId?: string) {
  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath('/admin/businesses');
  revalidatePath('/admin');
  // The guided builder is another view of the same business, and its live
  // preview is only honest if a write here refreshes it too.
  revalidatePath(`/admin/build/${businessId}`, 'layout');
  revalidatePath(`/admin/preview/${businessId}`);

  if (publicId) {
    revalidatePath(`/m/${publicId}`);
    invalidateProfile(publicId);
  }
}

export async function createBusinessAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = businessSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues) };
  }

  let businessId: string | null = null;

  const result = await run(async () => {
    const business = await createBusiness(user, parsed.data);
    businessId = business.id;
    revalidateBusiness(business.id, business.publicId);
  });

  if (result.error) return result;

  // Redirect throws, so it must happen outside the try/catch in `run`.
  redirect(`/admin/businesses/${businessId}`);
}

export async function updateBusinessAction(
  businessId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = businessSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };

  return run(async () => {
    const business = await updateBusiness(user, businessId, parsed.data);
    revalidateBusiness(businessId, business.publicId);
    return 'Business saved';
  });
}

export async function updateBrandAction(
  businessId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = brandSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };

  return run(async () => {
    await updateBrand(user, businessId, parsed.data);
    revalidateBusiness(businessId, publicId);
    return 'Brand saved — the QR and URL are unchanged';
  });
}

export async function updateTemplateAction(
  businessId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = templateSelectionSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };

  return run(async () => {
    await updateTemplate(user, businessId, parsed.data);
    revalidateBusiness(businessId, publicId);
    return 'Template applied — the QR and URL are unchanged';
  });
}

export async function createBranchAction(
  businessId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = branchSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };

  return run(async () => {
    await createBranch(user, businessId, parsed.data);
    revalidateBusiness(businessId, publicId);
    return 'Branch created';
  });
}

export async function updateBranchAction(
  businessId: string,
  branchId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = branchSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };

  return run(async () => {
    await updateBranch(user, businessId, branchId, parsed.data);
    revalidateBusiness(businessId, publicId);
    return 'Branch saved';
  });
}

export async function deleteBranchAction(
  businessId: string,
  branchId: string,
  publicId: string,
): Promise<ActionState> {
  const user = await requireUser();

  return run(async () => {
    await deleteBranch(user, businessId, branchId);
    revalidateBusiness(businessId, publicId);
    return 'Branch removed';
  });
}

export async function createMenuAction(
  businessId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = menuSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };

  return run(async () => {
    await createMenu(user, businessId, parsed.data);
    revalidateBusiness(businessId, publicId);
    return 'Menu created';
  });
}

export async function updateMenuAction(
  businessId: string,
  menuId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = menuSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };

  return run(async () => {
    await updateMenu(user, businessId, menuId, parsed.data);
    revalidateBusiness(businessId, publicId);
    return 'Menu saved';
  });
}

export async function publishMenuAction(
  businessId: string,
  menuId: string,
  publicId: string,
): Promise<ActionState> {
  const user = await requireUser();

  return run(async () => {
    const version = await publishMenu(user, businessId, menuId);
    revalidateBusiness(businessId, publicId);
    return `Published version ${version.version} — the same QR now serves it`;
  });
}

export async function createCategoryAction(
  businessId: string,
  menuId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = categorySchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };

  return run(async () => {
    await createCategory(user, businessId, menuId, parsed.data);
    revalidateBusiness(businessId, publicId);
    return 'Category created';
  });
}

export async function updateCategoryAction(
  businessId: string,
  categoryId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = categorySchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };

  return run(async () => {
    await updateCategory(user, businessId, categoryId, parsed.data);
    revalidateBusiness(businessId, publicId);
    return 'Category saved';
  });
}

export async function deleteCategoryAction(
  businessId: string,
  categoryId: string,
  publicId: string,
): Promise<ActionState> {
  const user = await requireUser();

  return run(async () => {
    await deleteCategory(user, businessId, categoryId);
    revalidateBusiness(businessId, publicId);
    return 'Category removed';
  });
}

export async function upsertItemAction(
  businessId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = itemSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: firstIssue(parsed.error.issues) };

  return run(async () => {
    const result = await upsertItem(user, businessId, parsed.data);
    revalidateBusiness(businessId, publicId);
    return result.created ? 'Item created' : 'Item updated';
  });
}

export async function deleteItemAction(
  businessId: string,
  itemId: string,
  publicId: string,
): Promise<ActionState> {
  const user = await requireUser();

  return run(async () => {
    await deleteItem(user, businessId, itemId);
    revalidateBusiness(businessId, publicId);
    return 'Item removed';
  });
}

function firstIssue(issues: { path: PropertyKey[]; message: string }[]): string {
  const issue = issues[0];
  if (!issue) return 'Invalid input';

  const field = issue.path.join('.');
  return field ? `${field}: ${issue.message}` : issue.message;
}

/**
 * Saves opening hours for the business or one of its branches (§21, §74).
 *
 * The target arrives as a bound argument rather than a form field, so a
 * crafted payload cannot redirect the write at a different record; the branch
 * id is still scoped to the tenant inside the service.
 */
export async function updateWorkingHoursAction(
  businessId: string,
  target: { kind: 'business' } | { kind: 'branch'; branchId: string },
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const hours = workingHoursFromForm(formData);

  return run(async () => {
    const business = await updateWorkingHours(user, businessId, target, hours);
    revalidateBusiness(businessId, business.publicId);
    return hours === null ? 'Opening hours cleared' : 'Opening hours saved';
  });
}

/**
 * Restores a published version (§85).
 *
 * MANAGER-level in the service, and confirmed in the UI: it replaces the
 * current draft content. What it does not touch is the QR, the public id or
 * the public URL — restoring content is exactly the kind of change GOALS I2
 * says must leave a printed code working.
 */
export async function restoreMenuVersionAction(
  businessId: string,
  publicId: string,
  menuId: string,
  versionId: string,
): Promise<ActionState> {
  const user = await requireUser();

  return run(async () => {
    const result = await restoreMenuVersion(user, businessId, menuId, versionId);
    revalidateBusiness(businessId, publicId);
    return `Restored version ${result.restoredFrom}, published as version ${result.version.version}`;
  });
}
