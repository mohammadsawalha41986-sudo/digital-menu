import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { ValidationError } from '@/server/admin/business-service';

/**
 * A deletion keeps everything it removes, so a restore brings it back whole.
 *
 * Deleting a menu cascades to its sections, dishes, every published version
 * and its design. Deleting a dish cascades to its gallery, its branch
 * overrides and its option-group links. Those rows are copied here, as plain
 * JSON, before anything is removed, and restored with their original ids so
 * every link between them comes back as it was.
 *
 * Price history is not copied: it has no foreign key, so it survives a
 * deletion already, and it stays as the record of what was charged.
 */

type Tx = Prisma.TransactionClient | PrismaClient;
type Row = Record<string, unknown>;

export interface ItemBundle {
  item: Row;
  gallery: Row[];
  overrides: Row[];
  modifiers: Row[];
}

export interface MenuBundle {
  menu: Row;
  versions: Row[];
  design: Row | null;
  categories: Row[];
  items: ItemBundle[];
}

export type Snapshot = { kind: 'MENU'; bundle: MenuBundle } | { kind: 'ITEMS'; items: ItemBundle[] };

/** Fields that hold a date. Dates travel as text inside the JSON and come back as dates. */
function isDateKey(key: string): boolean {
  return /At$/.test(key) || key === 'lastViewed';
}

/** Plain JSON-safe copy: dates become ISO text, everything else is kept as it is. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Turns the stored JSON back into rows Prisma accepts: date fields become dates again. */
export function fromJson<T extends Row>(row: Row): T {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'string' && isDateKey(key) ? new Date(value) : value;
  }
  return out as T;
}

async function bundleItems(tx: Tx, items: Row[]): Promise<ItemBundle[]> {
  if (items.length === 0) return [];
  const itemIds = items.map((item) => String(item.id));

  const [gallery, overrides, modifiers] = await Promise.all([
    tx.menuItemImage.findMany({ where: { itemId: { in: itemIds } } }),
    tx.branchItemOverride.findMany({ where: { itemId: { in: itemIds } } }),
    tx.menuItemModifierGroup.findMany({ where: { itemId: { in: itemIds } } }),
  ]);

  return items.map((item) => ({
    item,
    gallery: gallery.filter((row) => row.itemId === item.id) as unknown as Row[],
    overrides: overrides.filter((row) => row.itemId === item.id) as unknown as Row[],
    modifiers: modifiers.filter((row) => row.itemId === item.id) as unknown as Row[],
  }));
}

/** Everything a menu owns, copied. Null when the menu is not this business's. */
export async function bundleMenu(tx: Tx, businessId: string, menuId: string): Promise<MenuBundle | null> {
  const menu = await tx.menu.findFirst({ where: { id: menuId, businessId } });
  if (!menu) return null;

  const [categories, versions, design] = await Promise.all([
    tx.menuCategory.findMany({ where: { menuId, businessId }, orderBy: { sortOrder: 'asc' } }),
    tx.menuVersion.findMany({ where: { menuId } }),
    tx.menuDesign.findFirst({ where: { menuId, businessId } }),
  ]);

  const items = await tx.menuItem.findMany({
    where: { businessId, categoryId: { in: categories.map((category) => category.id) } },
    orderBy: { sortOrder: 'asc' },
  });

  return {
    menu: toJson(menu) as Row,
    versions: toJson(versions) as Row[],
    design: design ? (toJson(design) as Row) : null,
    categories: toJson(categories) as Row[],
    items: toJson(await bundleItems(tx, items)) as unknown as ItemBundle[],
  };
}

/** The given dishes of one business, copied with their links. */
export async function bundleDishes(tx: Tx, businessId: string, itemIds: string[]): Promise<ItemBundle[]> {
  const items = await tx.menuItem.findMany({ where: { businessId, id: { in: itemIds } } });
  return toJson(await bundleItems(tx, items)) as unknown as ItemBundle[];
}

/** Puts a menu back with its ids, sections, dishes, versions, design and links. */
export async function restoreMenu(tx: Tx, businessId: string, bundle: MenuBundle): Promise<void> {
  const menu = fromJson<Row & { id: string; key: string; currentVersionId: string | null }>(bundle.menu);

  const sameKey = await tx.menu.findFirst({ where: { businessId, key: menu.key } });
  if (sameKey) {
    throw new ValidationError(`A menu called "${menu.key}" already exists. Rename or remove it first.`);
  }
  await assertNoItemCodeClash(tx, businessId, bundle.items);

  await tx.menu.create({ data: { ...menu, currentVersionId: null } as Prisma.MenuUncheckedCreateInput });

  if (bundle.versions.length > 0) {
    await tx.menuVersion.createMany({ data: bundle.versions.map((row) => fromJson(row)) as Prisma.MenuVersionCreateManyInput[] });
  }
  if (menu.currentVersionId) {
    await tx.menu.update({ where: { id: menu.id }, data: { currentVersionId: menu.currentVersionId } });
  }
  if (bundle.design) {
    await tx.menuDesign.create({ data: fromJson(bundle.design) as Prisma.MenuDesignUncheckedCreateInput });
  }

  // A section's parent must exist before the section, so parents go first.
  const pending = bundle.categories.map((row) => fromJson(row) as Row & { id: string; parentId: string | null });
  const placed = new Set<string>();
  while (pending.length > 0) {
    const ready = pending.filter((row) => !row.parentId || placed.has(String(row.parentId)));
    if (ready.length === 0) throw new ValidationError('A section refers to a missing parent; the menu cannot be restored as it was.');
    await tx.menuCategory.createMany({ data: ready as unknown as Prisma.MenuCategoryCreateManyInput[] });
    for (const row of ready) {
      placed.add(row.id);
      pending.splice(pending.indexOf(row), 1);
    }
  }

  await restoreItemBundles(tx, bundle.items);
}

/** Puts dishes back into the sections they came from. */
export async function restoreItems(tx: Tx, businessId: string, bundles: ItemBundle[]): Promise<void> {
  await assertNoItemCodeClash(tx, businessId, bundles);
  const categoryIds = [...new Set(bundles.map((bundle) => String(bundle.item.categoryId)))];
  const present = await tx.menuCategory.findMany({ where: { businessId, id: { in: categoryIds } }, select: { id: true } });
  if (present.length !== categoryIds.length) {
    throw new ValidationError('A section these dishes belonged to was removed. Restore that menu first.');
  }
  await restoreItemBundles(tx, bundles);
}

async function assertNoItemCodeClash(tx: Tx, businessId: string, bundles: ItemBundle[]): Promise<void> {
  const codes = bundles.map((bundle) => String(bundle.item.itemCode));
  if (codes.length === 0) return;
  const clash = await tx.menuItem.findFirst({ where: { businessId, itemCode: { in: codes } }, select: { itemCode: true } });
  if (clash) {
    throw new ValidationError(`A dish with the code ${clash.itemCode} already exists. Its code is in use; remove it first.`);
  }
}

async function restoreItemBundles(tx: Tx, bundles: ItemBundle[]): Promise<void> {
  if (bundles.length === 0) return;
  await tx.menuItem.createMany({ data: bundles.map((bundle) => fromJson(bundle.item)) as Prisma.MenuItemCreateManyInput[] });

  const gallery = bundles.flatMap((bundle) => bundle.gallery.map((row) => fromJson(row)));
  if (gallery.length > 0) await tx.menuItemImage.createMany({ data: gallery as Prisma.MenuItemImageCreateManyInput[] });

  const overrides = bundles.flatMap((bundle) => bundle.overrides.map((row) => fromJson(row)));
  if (overrides.length > 0) await tx.branchItemOverride.createMany({ data: overrides as Prisma.BranchItemOverrideCreateManyInput[] });

  const modifiers = bundles.flatMap((bundle) => bundle.modifiers.map((row) => fromJson(row)));
  if (modifiers.length > 0) await tx.menuItemModifierGroup.createMany({ data: modifiers as Prisma.MenuItemModifierGroupCreateManyInput[] });
}
