import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { requireTenantContext, tenantScope, type AuthenticatedUser } from '@/server/tenancy/context';
import { ValidationError, createCategory, createMenu, newItemCode, publishMenu } from '@/server/admin/business-service';
import { categoryCreateSchema } from '@/server/admin/validation';
import { uniqueKey } from '@/lib/keys';
import { parsePriceToMinor } from '@/lib/money';
import {
  bundleDishes,
  bundleMenu,
  restoreItems,
  restoreMenu,
  toJson,
  type ItemBundle,
  type MenuBundle,
  type Snapshot,
} from './snapshot';

/**
 * Menu and dish management: deleting for real, but never silently losing
 * anything, editing a dish with conflict detection, and moving or ordering
 * dishes.
 *
 * Roles: editing a dish needs EDITOR; deleting, restoring and bulk-deleting
 * need MANAGER, because they remove things the public menu shows.
 */

const ITEM_AVAILABILITY = ['AVAILABLE', 'UNAVAILABLE', 'SEASONAL', 'HIDDEN'] as const;
type ItemAvailability = (typeof ITEM_AVAILABILITY)[number];

/** Someone else changed the dish first. Carries what is there now, so the screen can show it. */
export class ItemConflictError extends Error {
  constructor(public readonly current: ItemView) {
    super('This dish was changed by someone else.');
    this.name = 'ItemConflictError';
  }
}

export interface ItemView {
  id: string;
  itemCode: string;
  categoryId: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  priceMinor: number | null;
  availability: string;
  sortOrder: number;
  imageMediaId: string | null;
  updatedAt: string;
}

export interface DeletedRecordView {
  id: string;
  kind: 'MENU' | 'ITEMS';
  label: string;
  count: number;
  deletedAt: Date;
  deletedBy: string | null;
  restoredAt: Date | null;
}

function viewOf(item: {
  id: string;
  itemCode: string;
  categoryId: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  priceMinor: number | null;
  availability: string;
  sortOrder: number;
  imageMediaId: string | null;
  updatedAt: Date;
}): ItemView {
  return {
    id: item.id,
    itemCode: item.itemCode,
    categoryId: item.categoryId,
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    descriptionAr: item.descriptionAr,
    descriptionEn: item.descriptionEn,
    priceMinor: item.priceMinor,
    availability: item.availability,
    sortOrder: item.sortOrder,
    imageMediaId: item.imageMediaId,
    updatedAt: item.updatedAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Shared-dish guard                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A dish that another dish suggests cannot be removed quietly: the suggestion
 * would point at nothing. Returns the codes of such dishes, outside the set
 * being removed, so the refusal can name them.
 */
async function sharedDishes(businessId: string, codes: string[], removedIds: string[]) {
  if (codes.length === 0) return [];
  const referencing = await prisma.menuItem.findMany({
    where: { businessId, pairsWith: { hasSome: codes }, id: { notIn: removedIds } },
    select: { itemCode: true, nameEn: true, nameAr: true },
  });
  return referencing.map((row) => row.nameEn ?? row.nameAr);
}

/* -------------------------------------------------------------------------- */
/* Delete a menu                                                              */
/* -------------------------------------------------------------------------- */

export interface MenuImpact {
  menuId: string;
  title: string;
  sections: number;
  dishes: number;
  publishedVersions: number;
  isLive: boolean;
  blockedBy: string[];
}

/** What deleting this menu would remove, shown before the owner confirms. */
export async function menuImpact(user: AuthenticatedUser, businessId: string, menuId: string): Promise<MenuImpact> {
  const context = await requireTenantContext(user, businessId, 'MANAGER');
  const menu = await prisma.menu.findFirst({
    where: { id: menuId, ...tenantScope(context) },
    select: {
      id: true,
      key: true,
      titleEn: true,
      titleAr: true,
      currentVersionId: true,
      categories: { select: { id: true, items: { select: { itemCode: true } } } },
      _count: { select: { versions: true } },
    },
  });
  if (!menu) throw new ValidationError('That menu was not found.');

  const dishes = menu.categories.flatMap((category) => category.items);
  const blockedBy = await sharedDishes(
    context.businessId,
    dishes.map((dish) => dish.itemCode),
    await menuItemIds(context.businessId, menu.categories.map((category) => category.id)),
  );

  return {
    menuId: menu.id,
    title: menu.titleEn ?? menu.titleAr,
    sections: menu.categories.length,
    dishes: dishes.length,
    publishedVersions: menu._count.versions,
    isLive: menu.currentVersionId !== null,
    blockedBy,
  };
}

async function menuItemIds(businessId: string, categoryIds: string[]): Promise<string[]> {
  const rows = await prisma.menuItem.findMany({
    where: { businessId, categoryId: { in: categoryIds } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * Deletes a menu, its sections and dishes, after the owner has typed its name.
 * Everything it removes is kept as a deletion record first.
 */
export async function deleteMenu(
  user: AuthenticatedUser,
  businessId: string,
  menuId: string,
  confirmation: string,
): Promise<{ recordId: string; impact: MenuImpact }> {
  const context = await requireTenantContext(user, businessId, 'MANAGER');
  const impact = await menuImpact(user, businessId, menuId);

  const menu = await prisma.menu.findFirst({ where: { id: menuId, ...tenantScope(context) }, select: { key: true } });
  if (!menu) throw new ValidationError('That menu was not found.');
  if (confirmation.trim() !== menu.key) {
    throw new ValidationError(`To delete this menu, type its name exactly: ${menu.key}`);
  }
  if (impact.blockedBy.length > 0) {
    throw new ValidationError(
      `These dishes are suggested by dishes in this menu, and would be left pointing at nothing: ${impact.blockedBy.join(', ')}. Remove the suggestion first.`,
    );
  }

  const recordId = await prisma.$transaction(async (tx) => {
    const bundle = await bundleMenu(tx, context.businessId, menuId);
    if (!bundle) throw new ValidationError('That menu was not found.');

    const record = await tx.deletedRecord.create({
      data: {
        businessId: context.businessId,
        kind: 'MENU',
        label: impact.title,
        snapshot: toJson({ kind: 'MENU', bundle } satisfies Snapshot),
        deletedById: user.id,
      },
      select: { id: true },
    });

    await tx.menu.delete({ where: { id: menuId } });
    return record.id;
  });

  await recordAudit({
    action: 'menu.deleted',
    entity: 'menu',
    entityId: menuId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { recordId, key: menu.key, sections: impact.sections, dishes: impact.dishes, wasLive: impact.isLive },
  });

  return { recordId, impact };
}

/* -------------------------------------------------------------------------- */
/* Delete dishes, in bulk                                                     */
/* -------------------------------------------------------------------------- */

export async function deleteDishes(
  user: AuthenticatedUser,
  businessId: string,
  itemIds: string[],
): Promise<{ recordId: string; count: number }> {
  const context = await requireTenantContext(user, businessId, 'MANAGER');
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) throw new ValidationError('Choose the dishes to delete first.');
  if (ids.length > 200) throw new ValidationError('Delete at most 200 dishes at a time.');

  const dishes = await prisma.menuItem.findMany({
    where: { ...tenantScope(context), id: { in: ids } },
    select: { id: true, itemCode: true, nameAr: true, nameEn: true },
  });
  if (dishes.length !== ids.length) throw new ValidationError('Some of those dishes were not found. Refresh and try again.');

  const blockedBy = await sharedDishes(
    context.businessId,
    dishes.map((dish) => dish.itemCode),
    ids,
  );
  if (blockedBy.length > 0) {
    throw new ValidationError(
      `These dishes are suggested by others, and would be left pointing at nothing: ${blockedBy.join(', ')}. Remove the suggestion first.`,
    );
  }

  const label = dishes
    .slice(0, 3)
    .map((dish) => dish.nameEn ?? dish.nameAr)
    .join(', ') + (dishes.length > 3 ? ` and ${dishes.length - 3} more` : '');

  const recordId = await prisma.$transaction(async (tx) => {
    const bundles = await bundleDishes(tx, context.businessId, ids);
    const record = await tx.deletedRecord.create({
      data: {
        businessId: context.businessId,
        kind: 'ITEMS',
        label,
        snapshot: toJson({ kind: 'ITEMS', items: bundles } satisfies Snapshot),
        deletedById: user.id,
      },
      select: { id: true },
    });
    await tx.menuItem.deleteMany({ where: { businessId: context.businessId, id: { in: ids } } });
    return record.id;
  });

  await recordAudit({
    action: 'item.deleted',
    entity: 'menu_item',
    businessId: context.businessId,
    userId: user.id,
    metadata: { recordId, count: dishes.length, codes: dishes.map((dish) => dish.itemCode) },
  });

  return { recordId, count: dishes.length };
}

/* -------------------------------------------------------------------------- */
/* Deleted records: list and restore                                          */
/* -------------------------------------------------------------------------- */

export async function listDeletedRecords(user: AuthenticatedUser, businessId: string): Promise<DeletedRecordView[]> {
  const context = await requireTenantContext(user, businessId, 'MANAGER');
  const rows = await prisma.deletedRecord.findMany({
    where: tenantScope(context),
    orderBy: { deletedAt: 'desc' },
    take: 30,
    select: {
      id: true,
      kind: true,
      label: true,
      snapshot: true,
      deletedAt: true,
      restoredAt: true,
      deletedBy: { select: { name: true } },
    },
  });

  return rows.map((row) => {
    const snapshot = row.snapshot as unknown as Snapshot;
    const count = snapshot.kind === 'MENU' ? snapshot.bundle.items.length : snapshot.items.length;
    return {
      id: row.id,
      kind: row.kind === 'MENU' ? 'MENU' : 'ITEMS',
      label: row.label,
      count,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy?.name ?? null,
      restoredAt: row.restoredAt,
    };
  });
}

export async function restoreDeletedRecord(user: AuthenticatedUser, businessId: string, recordId: string) {
  const context = await requireTenantContext(user, businessId, 'MANAGER');

  await prisma.$transaction(async (tx) => {
    const record = await tx.deletedRecord.findFirst({ where: { id: recordId, ...tenantScope(context) } });
    if (!record) throw new ValidationError('That deletion was not found.');
    if (record.restoredAt) throw new ValidationError('That has already been restored.');

    const snapshot = record.snapshot as unknown as Snapshot;
    if (snapshot.kind === 'MENU') {
      await restoreMenu(tx, context.businessId, snapshot.bundle as MenuBundle);
    } else {
      await restoreItems(tx, context.businessId, snapshot.items as ItemBundle[]);
    }

    await tx.deletedRecord.update({ where: { id: recordId }, data: { restoredAt: new Date() } });
  });

  await recordAudit({
    action: 'deleted.restored',
    entity: 'deleted_record',
    entityId: recordId,
    businessId: context.businessId,
    userId: user.id,
  });
}

/* -------------------------------------------------------------------------- */
/* Edit a dish: fields, with conflict detection                               */
/* -------------------------------------------------------------------------- */

export interface ItemPatch {
  nameAr?: string;
  nameEn?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  /** The price as typed. Empty means no price. */
  price?: string;
  availability?: ItemAvailability;
  sortOrder?: number;
}

function cleanPatch(patch: ItemPatch) {
  const out: Record<string, unknown> = {};
  if (patch.nameAr !== undefined) {
    const value = patch.nameAr.trim();
    if (!value) throw new ValidationError('The dish needs a name in Arabic.');
    if (value.length > 120) throw new ValidationError('Keep the Arabic name under 120 characters.');
    out.nameAr = value;
  }
  if (patch.nameEn !== undefined) {
    const value = patch.nameEn.trim();
    if (value.length > 120) throw new ValidationError('Keep the English name under 120 characters.');
    out.nameEn = value || null;
  }
  for (const key of ['descriptionAr', 'descriptionEn'] as const) {
    if (patch[key] !== undefined) {
      const value = patch[key]!.trim();
      if (value.length > 500) throw new ValidationError('Keep a description under 500 characters.');
      out[key] = value || null;
    }
  }
  if (patch.availability !== undefined) {
    if (!(ITEM_AVAILABILITY as readonly string[]).includes(patch.availability)) {
      throw new ValidationError('Choose available, out right now, seasonal, or hidden.');
    }
    out.availability = patch.availability;
  }
  if (patch.sortOrder !== undefined) {
    if (!Number.isInteger(patch.sortOrder) || patch.sortOrder < 0 || patch.sortOrder > 100000) {
      throw new ValidationError('The order must be a whole number.');
    }
    out.sortOrder = patch.sortOrder;
  }
  return out;
}

/**
 * Saves some fields of one dish. `expectedUpdatedAt` is the version the screen
 * was showing: if the dish has changed since, nothing is written and the
 * current version is returned, so the screen can show what changed.
 */
export async function updateDish(
  user: AuthenticatedUser,
  businessId: string,
  itemId: string,
  patch: ItemPatch,
  expectedUpdatedAt: string | null,
): Promise<ItemView> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const data = cleanPatch(patch);

  const business = await prisma.business.findUniqueOrThrow({ where: { id: context.businessId }, select: { currency: true } });
  let priceMinor: number | null | undefined;
  if (patch.price !== undefined) {
    const text = patch.price.trim();
    if (text === '') {
      priceMinor = null;
    } else {
      const parsed = parsePriceToMinor(text, business.currency);
      if (parsed === null) throw new ValidationError(`Could not read the price "${text}".`);
      priceMinor = parsed;
    }
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.menuItem.findFirst({ where: { id: itemId, ...tenantScope(context) } });
    if (!current) throw new ValidationError('That dish was not found. It may have been deleted.');

    if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== current.updatedAt.getTime()) {
      throw new ItemConflictError(viewOf(current));
    }

    const priceChanged = priceMinor !== undefined && priceMinor !== current.priceMinor;
    if (priceChanged) {
      data.priceMinor = priceMinor;
      data.currency = business.currency;
    }

    const changed = Object.keys(data);
    if (changed.length === 0) return viewOf(current);

    // Only the row whose version we checked: a second writer makes this update match nothing.
    const result = await tx.menuItem.updateMany({
      where: { id: itemId, ...tenantScope(context), updatedAt: current.updatedAt },
      data: data as Parameters<typeof tx.menuItem.updateMany>[0]['data'],
    });
    if (result.count === 0) {
      const latest = await tx.menuItem.findFirst({ where: { id: itemId, ...tenantScope(context) } });
      if (!latest) throw new ValidationError('That dish was deleted while you were editing.');
      throw new ItemConflictError(viewOf(latest));
    }

    const saved = await tx.menuItem.findFirstOrThrow({ where: { id: itemId, ...tenantScope(context) } });

    if (priceChanged) {
      await tx.priceHistory.create({
        data: {
          businessId: context.businessId,
          itemId: saved.id,
          itemCode: saved.itemCode,
          oldPriceMinor: current.priceMinor,
          newPriceMinor: priceMinor ?? null,
          currency: business.currency,
          changedById: user.id,
        },
      });
    }

    await recordAudit({
      action: 'item.updated',
      entity: 'menu_item',
      entityId: saved.id,
      businessId: context.businessId,
      userId: user.id,
      metadata: { itemCode: saved.itemCode, fields: changed },
    });
    if (priceChanged) {
      await recordAudit({
        action: 'item.price_changed',
        entity: 'menu_item',
        entityId: saved.id,
        businessId: context.businessId,
        userId: user.id,
        metadata: { itemCode: saved.itemCode, from: current.priceMinor, to: priceMinor ?? null, currency: business.currency },
      });
    }

    return viewOf(saved);
  });
}

/* -------------------------------------------------------------------------- */
/* Order and move                                                             */
/* -------------------------------------------------------------------------- */

/** Sets the display order of a section's dishes to the order given. */
export async function reorderDishes(
  user: AuthenticatedUser,
  businessId: string,
  categoryId: string,
  orderedIds: string[],
): Promise<void> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const unique = [...new Set(orderedIds)];

  await prisma.$transaction(async (tx) => {
    const dishes = await tx.menuItem.findMany({
      where: { ...tenantScope(context), categoryId },
      select: { id: true },
    });
    const known = new Set(dishes.map((dish) => dish.id));
    if (unique.length !== known.size || unique.some((id) => !known.has(id))) {
      throw new ValidationError('The order does not match this section. Refresh and try again.');
    }
    await Promise.all(
      unique.map((id, index) => tx.menuItem.update({ where: { id }, data: { sortOrder: index } })),
    );
  });

  await recordAudit({
    action: 'item.reordered',
    entity: 'menu_category',
    entityId: categoryId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { count: unique.length },
  });
}

/** Moves dishes into another section, in this restaurant. Codes stay the same, so suggestions still resolve. */
export async function moveDishes(
  user: AuthenticatedUser,
  businessId: string,
  itemIds: string[],
  targetCategoryId: string,
): Promise<number> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) throw new ValidationError('Choose the dishes to move first.');

  const target = await prisma.menuCategory.findFirst({ where: { id: targetCategoryId, ...tenantScope(context) }, select: { id: true } });
  if (!target) throw new ValidationError('That section was not found.');

  const result = await prisma.menuItem.updateMany({
    where: { ...tenantScope(context), id: { in: ids } },
    data: { categoryId: targetCategoryId },
  });

  await recordAudit({
    action: 'item.moved',
    entity: 'menu_category',
    entityId: targetCategoryId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { count: result.count },
  });

  return result.count;
}

/** Adds a dish to a section, with a code that is free in this restaurant. */
export async function createDish(
  user: AuthenticatedUser,
  businessId: string,
  input: {
    categoryId?: string | null;
    /** A section to create for this dish, when the owner names a new one instead of choosing. */
    newSection?: string | null;
    nameAr: string;
    nameEn?: string;
    price?: string;
    availability?: ItemAvailability;
  },
): Promise<ItemView> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  let categoryId = input.categoryId ?? '';
  if (!categoryId) {
    const sectionName = (input.newSection ?? '').trim();
    if (!sectionName) throw new ValidationError('Choose a section, or name a new one.');
    categoryId = (await createSection(user, businessId, { nameAr: sectionName })).id;
  }
  const category = await prisma.menuCategory.findFirst({ where: { id: categoryId, ...tenantScope(context) }, select: { id: true } });
  if (!category) throw new ValidationError('Choose a section first.');

  const itemCode = await newItemCode(user, businessId);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: context.businessId }, select: { currency: true } });
  const cleaned = cleanPatch({ nameAr: input.nameAr, nameEn: input.nameEn ?? '', availability: input.availability ?? 'AVAILABLE' });
  const price = (input.price ?? '').trim();
  const priceMinor = price === '' ? null : parsePriceToMinor(price, business.currency);
  if (price !== '' && priceMinor === null) throw new ValidationError(`Could not read the price "${price}".`);

  const created = await prisma.menuItem.create({
    data: {
      businessId: context.businessId,
      categoryId,
      itemCode,
      nameAr: String(cleaned.nameAr),
      nameEn: (cleaned.nameEn as string | null) ?? null,
      priceMinor,
      currency: business.currency,
      availability: (cleaned.availability as ItemAvailability) ?? 'AVAILABLE',
    },
  });

  await recordAudit({
    action: 'item.created',
    entity: 'menu_item',
    entityId: created.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { itemCode, categoryId },
  });

  return viewOf(created);
}

/**
 * The menu new sections and dishes go into: the one named, else the first.
 *
 * A restaurant with no menu at all gets one, created and published at once,
 * so its first section, dish or import works from zero and reaches the public
 * menu as soon as it is saved. The key avoids the key of any deleted menu, so
 * that menu can still be restored later without a clash.
 */
export async function ensureMenu(
  user: AuthenticatedUser,
  businessId: string,
  menuId?: string | null,
): Promise<{ id: string; key: string; created: boolean }> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  if (menuId) {
    const named = await prisma.menu.findFirst({ where: { id: menuId, ...tenantScope(context) }, select: { id: true, key: true } });
    if (!named) throw new ValidationError('That menu was not found.');
    return { ...named, created: false };
  }
  const first = await prisma.menu.findFirst({
    where: tenantScope(context),
    orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    select: { id: true, key: true },
  });
  if (first) return { ...first, created: false };

  const deleted = await prisma.deletedRecord.findMany({
    where: { businessId: context.businessId, kind: 'MENU', restoredAt: null },
    select: { snapshot: true },
  });
  const takenByDeleted = deleted
    .map((record) => (record.snapshot as { bundle?: { menu?: { key?: unknown } } } | null)?.bundle?.menu?.key)
    .filter((key): key is string => typeof key === 'string');

  const menu = await createMenu(user, businessId, {
    key: uniqueKey('main', takenByDeleted),
    titleAr: 'المنيو',
    titleEn: 'Menu',
    status: 'ACTIVE',
    sortOrder: 0,
  });
  await publishMenu(user, businessId, menu.id);
  return { id: menu.id, key: menu.key, created: true };
}

/** Adds a section, creating the restaurant's first menu if it has none. */
export async function createSection(
  user: AuthenticatedUser,
  businessId: string,
  input: { nameAr: string; nameEn?: string | null; menuId?: string | null },
): Promise<{ id: string; nameAr: string; menuId: string; menuCreated: boolean }> {
  await requireTenantContext(user, businessId, 'EDITOR');
  const nameAr = input.nameAr.trim();
  if (!nameAr) throw new ValidationError('Give the section a name.');
  if (nameAr.length > 120) throw new ValidationError('A section name can be at most 120 characters.');
  const nameEn = (input.nameEn ?? '').trim();

  const menu = await ensureMenu(user, businessId, input.menuId);
  const category = await createCategory(
    user,
    businessId,
    menu.id,
    categoryCreateSchema.parse({ nameAr, ...(nameEn ? { nameEn } : {}) }),
  );
  return { id: category.id, nameAr: category.nameAr, menuId: menu.id, menuCreated: menu.created };
}

/**
 * Removes an empty section. A section with dishes or sub-sections is refused:
 * removing it would take them with it, and dishes are removed on their own,
 * where they can be restored.
 */
export async function deleteSection(user: AuthenticatedUser, businessId: string, categoryId: string): Promise<void> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const section = await prisma.menuCategory.findFirst({
    where: { id: categoryId, ...tenantScope(context) },
    select: { id: true, key: true, nameAr: true, _count: { select: { items: true, children: true } } },
  });
  if (!section) throw new ValidationError('That section was not found.');
  if (section._count.items > 0) {
    throw new ValidationError('This section still has dishes. Move them to another section or delete them first.');
  }
  if (section._count.children > 0) throw new ValidationError('This section has sub-sections. Remove those first.');

  await prisma.menuCategory.delete({ where: { id: section.id } });
  await recordAudit({
    action: 'category.deleted',
    entity: 'menu_category',
    entityId: section.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { key: section.key, nameAr: section.nameAr },
  });
}

/**
 * Sets the order of a menu's sections. The whole order is written at once, so
 * a replayed request cannot drift it, and a list that no longer matches the
 * menu (a section added or removed meanwhile) is refused rather than guessed at.
 */
export async function reorderSections(
  user: AuthenticatedUser,
  businessId: string,
  menuId: string,
  orderedIds: string[],
): Promise<void> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const sections = await prisma.menuCategory.findMany({ where: { menuId, ...tenantScope(context) }, select: { id: true } });
  if (sections.length === 0) throw new ValidationError('That menu was not found.');

  const known = new Set(sections.map((section) => section.id));
  const complete =
    orderedIds.length === sections.length &&
    new Set(orderedIds).size === orderedIds.length &&
    orderedIds.every((id) => known.has(id));
  if (!complete) throw new ValidationError('The sections changed on another screen. Reload the page and arrange them again.');

  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.menuCategory.update({ where: { id }, data: { sortOrder: index } })),
  );
  await recordAudit({
    action: 'category.updated',
    entity: 'menu',
    entityId: menuId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { reordered: orderedIds.length },
  });
}

/**
 * Shows or hides a section on the public menu. A hidden section keeps its
 * dishes, its order and its layout; customers simply do not see it.
 */
export async function setSectionVisible(
  user: AuthenticatedUser,
  businessId: string,
  categoryId: string,
  visible: boolean,
): Promise<{ nameAr: string }> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const section = await prisma.menuCategory.findFirst({ where: { id: categoryId, ...tenantScope(context) }, select: { id: true, nameAr: true } });
  if (!section) throw new ValidationError('That section was not found.');
  await prisma.menuCategory.update({ where: { id: section.id }, data: { isActive: visible } });
  await recordAudit({
    action: 'category.updated',
    entity: 'menu_category',
    entityId: section.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { visible },
  });
  return { nameAr: section.nameAr };
}
