import type { z } from 'zod';
import { generatePublicId, isValidPublicId } from '@/lib/public-id';
import { parsePriceToMinor } from '@/lib/money';
import { prisma } from '@/server/db/client';
import { diffFields, recordAudit } from '@/server/audit/log';
import {
  TenantAccessError,
  requireTenantContext,
  roleAtLeast,
  tenantScope,
  type AuthenticatedUser,
} from '@/server/tenancy/context';
import { isValidTemplateSelection } from '@/templates/registry';
import type {
  branchSchema,
  brandSchema,
  businessSchema,
  categorySchema,
  itemSchema,
  menuSchema,
  templateSelectionSchema,
} from './validation';

/**
 * Admin write services.
 *
 * Every function here takes the *acting user* and a business identifier, and
 * resolves a tenant context before touching a row (master spec §128; GOALS I8).
 * No function accepts a pre-resolved business id from a caller, because that
 * would make it possible to bypass the check by calling the service directly.
 *
 * Each write also records an audit entry, and price changes record both the
 * old and new value — that is the one an operator is asked about months later
 * (§124).
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

type BusinessInput = z.infer<typeof businessSchema>;
type BranchInput = z.infer<typeof branchSchema>;
type BrandInput = z.infer<typeof brandSchema>;
type MenuInput = z.infer<typeof menuSchema>;
type CategoryInput = z.infer<typeof categorySchema>;
type ItemInput = z.infer<typeof itemSchema>;
type TemplateInput = z.infer<typeof templateSelectionSchema>;

// --- Businesses ------------------------------------------------------------

/**
 * Creates a business and its public identifier.
 *
 * Only a platform super admin may create tenants: there is no membership to
 * check against for a business that does not exist yet, so the check is the
 * platform role.
 */
export async function createBusiness(user: AuthenticatedUser, input: BusinessInput) {
  if (user.role !== 'SUPER_ADMIN') throw new TenantAccessError('Only platform staff may create a business');

  const publicId = await allocatePublicId();

  const business = await prisma.$transaction(async (tx) => {
    const created = await tx.business.create({
      data: { ...input, publicId },
    });

    // The creator gets an owner membership so tenant-scoped operations work
    // through the ordinary path rather than relying on the platform role.
    await tx.businessMembership.create({
      data: { userId: user.id, businessId: created.id, role: 'OWNER' },
    });

    await tx.brandTheme.create({ data: { businessId: created.id } });

    return created;
  });

  await recordAudit({
    action: 'business.created',
    entity: 'business',
    entityId: business.id,
    businessId: business.id,
    userId: user.id,
    metadata: { publicId, slug: business.slug },
  });

  return business;
}

/**
 * Allocates a collision-free public id.
 *
 * Retries rather than trusting randomness: the id space is deliberately small
 * and legible, so collisions are rare but not impossible, and a duplicate
 * would be catastrophic — two businesses behind one printed QR.
 */
async function allocatePublicId(attempts = 8): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = generatePublicId();
    const existing = await prisma.business.findUnique({
      where: { publicId: candidate },
      select: { id: true },
    });

    if (!existing) return candidate;
  }

  throw new Error('Could not allocate a unique public identifier');
}

export async function updateBusiness(
  user: AuthenticatedUser,
  businessId: string,
  input: BusinessInput,
) {
  const context = await requireTenantContext(user, businessId, 'MANAGER');

  const before = await prisma.business.findUniqueOrThrow({ where: { id: context.businessId } });

  // The public id is never in the update payload — it is the printed QR.
  const updated = await prisma.business.update({
    where: { id: context.businessId },
    data: input,
  });

  await recordAudit({
    action: before.status === updated.status ? 'business.updated' : 'business.status_changed',
    entity: 'business',
    entityId: updated.id,
    businessId: updated.id,
    userId: user.id,
    metadata: diffFields(before as unknown as Record<string, unknown>, input),
  });

  return updated;
}

// --- Branding and template -------------------------------------------------

export async function updateBrand(user: AuthenticatedUser, businessId: string, input: BrandInput) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const before = await prisma.brandTheme.findUnique({ where: { businessId: context.businessId } });

  const theme = await prisma.brandTheme.upsert({
    where: { businessId: context.businessId },
    update: input,
    create: { businessId: context.businessId, ...input },
  });

  await recordAudit({
    action: 'brand.updated',
    entity: 'brand_theme',
    entityId: theme.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: before ? diffFields(before as unknown as Record<string, unknown>, input) : { created: true },
  });

  return theme;
}

/**
 * Switches template family or variant. Presentation only: no identifier, URL,
 * QR, menu row or analytics record is touched (master spec §149).
 */
export async function updateTemplate(
  user: AuthenticatedUser,
  businessId: string,
  input: TemplateInput,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  if (!isValidTemplateSelection(input.templateKey, input.variantKey)) {
    throw new ValidationError('Unknown template or layout variant');
  }

  const before = await prisma.business.findUniqueOrThrow({
    where: { id: context.businessId },
    select: { templateKey: true, variantKey: true },
  });

  const updated = await prisma.business.update({
    where: { id: context.businessId },
    data: { templateKey: input.templateKey, variantKey: input.variantKey },
  });

  await recordAudit({
    action: 'template.changed',
    entity: 'business',
    entityId: updated.id,
    businessId: updated.id,
    userId: user.id,
    metadata: diffFields(before, input),
  });

  return updated;
}

// --- Branches --------------------------------------------------------------

export async function createBranch(user: AuthenticatedUser, businessId: string, input: BranchInput) {
  const context = await requireTenantContext(user, businessId, 'MANAGER');

  const branch = await prisma.branch.create({
    data: { ...input, businessId: context.businessId },
  });

  await recordAudit({
    action: 'branch.created',
    entity: 'branch',
    entityId: branch.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { key: branch.key },
  });

  return branch;
}

export async function updateBranch(
  user: AuthenticatedUser,
  businessId: string,
  branchId: string,
  input: BranchInput,
) {
  const context = await requireTenantContext(user, businessId, 'MANAGER');

  // `updateMany` with the tenant scope, not `update` by id: a branch id from
  // another tenant then matches nothing instead of being updated.
  const result = await prisma.branch.updateMany({
    where: { id: branchId, ...tenantScope(context) },
    data: input,
  });

  if (result.count === 0) throw new TenantAccessError('Branch not found');

  await recordAudit({
    action: 'branch.updated',
    entity: 'branch',
    entityId: branchId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { key: input.key },
  });
}

export async function deleteBranch(user: AuthenticatedUser, businessId: string, branchId: string) {
  const context = await requireTenantContext(user, businessId, 'MANAGER');

  const result = await prisma.branch.deleteMany({
    where: { id: branchId, ...tenantScope(context) },
  });

  if (result.count === 0) throw new TenantAccessError('Branch not found');

  await recordAudit({
    action: 'branch.deleted',
    entity: 'branch',
    entityId: branchId,
    businessId: context.businessId,
    userId: user.id,
  });
}

// --- Menus, categories, items ---------------------------------------------

export async function createMenu(user: AuthenticatedUser, businessId: string, input: MenuInput) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const menu = await prisma.menu.create({ data: { ...input, businessId: context.businessId } });

  await recordAudit({
    action: 'menu.created',
    entity: 'menu',
    entityId: menu.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { key: menu.key },
  });

  return menu;
}

export async function updateMenu(
  user: AuthenticatedUser,
  businessId: string,
  menuId: string,
  input: MenuInput,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const result = await prisma.menu.updateMany({
    where: { id: menuId, ...tenantScope(context) },
    data: input,
  });

  if (result.count === 0) throw new TenantAccessError('Menu not found');

  await recordAudit({
    action: 'menu.updated',
    entity: 'menu',
    entityId: menuId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { key: input.key, status: input.status },
  });
}

/**
 * Publishes a menu: appends a version and repoints the current pointer.
 *
 * Atomic on purpose. A menu observed between the two writes would have no
 * current version and would vanish from the public profile — which is exactly
 * the kind of flicker a printed QR must never produce (§125).
 */
export async function publishMenu(user: AuthenticatedUser, businessId: string, menuId: string) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const version = await prisma.$transaction(async (tx) => {
    const menu = await tx.menu.findFirst({
      where: { id: menuId, ...tenantScope(context) },
      select: { id: true, key: true },
    });

    if (!menu) throw new TenantAccessError('Menu not found');

    const latest = await tx.menuVersion.findFirst({
      where: { menuId: menu.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const created = await tx.menuVersion.create({
      data: {
        menuId: menu.id,
        version: (latest?.version ?? 0) + 1,
        publishedAt: new Date(),
        publishedById: user.id,
      },
    });

    await tx.menu.update({
      where: { id: menu.id },
      data: { currentVersionId: created.id, status: 'ACTIVE' },
    });

    return created;
  });

  await recordAudit({
    action: 'menu.published',
    entity: 'menu',
    entityId: menuId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { version: version.version },
  });

  return version;
}

export async function createCategory(
  user: AuthenticatedUser,
  businessId: string,
  menuId: string,
  input: CategoryInput,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const menu = await prisma.menu.findFirst({
    where: { id: menuId, ...tenantScope(context) },
    select: { id: true },
  });

  if (!menu) throw new TenantAccessError('Menu not found');

  const category = await prisma.menuCategory.create({
    data: { ...input, menuId: menu.id, businessId: context.businessId },
  });

  await recordAudit({
    action: 'category.created',
    entity: 'menu_category',
    entityId: category.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { key: category.key },
  });

  return category;
}

export async function updateCategory(
  user: AuthenticatedUser,
  businessId: string,
  categoryId: string,
  input: CategoryInput,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const result = await prisma.menuCategory.updateMany({
    where: { id: categoryId, ...tenantScope(context) },
    data: input,
  });

  if (result.count === 0) throw new TenantAccessError('Category not found');

  await recordAudit({
    action: 'category.updated',
    entity: 'menu_category',
    entityId: categoryId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { key: input.key },
  });
}

export async function deleteCategory(
  user: AuthenticatedUser,
  businessId: string,
  categoryId: string,
) {
  const context = await requireTenantContext(user, businessId, 'MANAGER');

  const result = await prisma.menuCategory.deleteMany({
    where: { id: categoryId, ...tenantScope(context) },
  });

  if (result.count === 0) throw new TenantAccessError('Category not found');

  await recordAudit({
    action: 'category.deleted',
    entity: 'menu_category',
    entityId: categoryId,
    businessId: context.businessId,
    userId: user.id,
  });
}

export interface UpsertItemResult {
  id: string;
  created: boolean;
}

/**
 * Creates or updates an item, matched on its business-scoped item code.
 *
 * The same code path backs the admin form and the Excel importer, which is
 * what makes "export, edit, re-import" update rather than duplicate (§66).
 */
export async function upsertItem(
  user: AuthenticatedUser,
  businessId: string,
  input: ItemInput,
): Promise<UpsertItemResult> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: context.businessId },
    select: { currency: true },
  });

  const category = await prisma.menuCategory.findFirst({
    where: { key: input.categoryKey, ...tenantScope(context) },
    select: { id: true },
  });

  if (!category) throw new ValidationError(`Unknown category: ${input.categoryKey}`);

  const priceMinor =
    input.price.trim() === '' ? null : parsePriceToMinor(input.price, business.currency);

  if (input.price.trim() !== '' && priceMinor === null) {
    // Refuse rather than guess: a wrong price reaches a printed menu.
    throw new ValidationError(`Could not read the price "${input.price}"`);
  }

  const existing = await prisma.menuItem.findUnique({
    where: { businessId_itemCode: { businessId: context.businessId, itemCode: input.itemCode } },
    select: { id: true, priceMinor: true },
  });

  const data = {
    categoryId: category.id,
    nameAr: input.nameAr,
    nameEn: input.nameEn,
    descriptionAr: input.descriptionAr,
    descriptionEn: input.descriptionEn,
    priceMinor,
    currency: business.currency,
    calories: input.calories,
    servingSizeAr: input.servingSizeAr,
    servingSizeEn: input.servingSizeEn,
    ingredientsAr: input.ingredientsAr,
    ingredientsEn: input.ingredientsEn,
    allergens: input.allergens,
    tags: input.tags,
    availability: input.availability,
    isFeatured: input.isFeatured,
    sortOrder: input.sortOrder,
  };

  const item = await prisma.menuItem.upsert({
    where: { businessId_itemCode: { businessId: context.businessId, itemCode: input.itemCode } },
    update: data,
    create: { ...data, businessId: context.businessId, itemCode: input.itemCode },
  });

  await recordAudit({
    action: existing ? 'item.updated' : 'item.created',
    entity: 'menu_item',
    entityId: item.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { itemCode: item.itemCode },
  });

  // A price change gets its own entry carrying both values — this is the one
  // an operator is asked to account for later (§124).
  if (existing && existing.priceMinor !== priceMinor) {
    await recordAudit({
      action: 'item.price_changed',
      entity: 'menu_item',
      entityId: item.id,
      businessId: context.businessId,
      userId: user.id,
      metadata: {
        itemCode: item.itemCode,
        from: existing.priceMinor,
        to: priceMinor,
        currency: business.currency,
      },
    });
  }

  return { id: item.id, created: !existing };
}

export async function deleteItem(user: AuthenticatedUser, businessId: string, itemId: string) {
  const context = await requireTenantContext(user, businessId, 'MANAGER');

  const result = await prisma.menuItem.deleteMany({
    where: { id: itemId, ...tenantScope(context) },
  });

  if (result.count === 0) throw new TenantAccessError('Item not found');

  await recordAudit({
    action: 'item.deleted',
    entity: 'menu_item',
    entityId: itemId,
    businessId: context.businessId,
    userId: user.id,
  });
}

// --- Reads used by admin screens ------------------------------------------

/** Businesses the acting user may see. A super admin sees the platform. */
export async function listBusinessesForUser(user: AuthenticatedUser) {
  const where =
    user.role === 'SUPER_ADMIN' ? {} : { memberships: { some: { userId: user.id } } };

  return prisma.business.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      publicId: true,
      slug: true,
      nameAr: true,
      nameEn: true,
      type: true,
      status: true,
      templateKey: true,
      updatedAt: true,
      _count: { select: { menus: true, branches: true, items: true } },
    },
  });
}

/** Loads one business for admin, enforcing the tenant grant first. */
export async function getBusinessForAdmin(user: AuthenticatedUser, businessId: string) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  return prisma.business.findUniqueOrThrow({
    where: { id: context.businessId },
    include: {
      brandTheme: true,
      branches: { orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] },
      menus: {
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
        include: {
          currentVersion: { select: { version: true, publishedAt: true } },
          categories: {
            orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
            include: {
              items: { orderBy: [{ sortOrder: 'asc' }, { itemCode: 'asc' }] },
            },
          },
        },
      },
    },
  });
}

export function canEdit(role: Parameters<typeof roleAtLeast>[0]): boolean {
  return roleAtLeast(role, 'EDITOR');
}

export { isValidPublicId };
