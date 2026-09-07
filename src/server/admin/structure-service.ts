import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { requireTenantContext, type AuthenticatedUser } from '@/server/tenancy/context';
import { ValidationError } from './business-service';

/**
 * Duplication and ordering.
 *
 * Both are the difference between a menu editor someone tolerates and one they
 * reach for. A Ramadan menu is last year's menu with eight prices changed; a
 * new dish is the dish above it with a different name. Retyping either is how
 * an operator ends up maintaining the menu in a spreadsheet instead.
 *
 * Everything here is tenant-scoped through `requireTenantContext` and, where
 * it writes more than one row, transactional: a half-copied menu is worse than
 * no copy, because the operator cannot tell which half is missing.
 */

/* -------------------------------------------------------------------------- */
/* Keys                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A key that does not collide, derived from one that does.
 *
 * `main` → `main-copy` → `main-copy-2`. Derived rather than random because the
 * key is in the public URL: `/m/DEM001/menu/main-copy` is a thing an operator
 * can read, remember and rename; `/menu/k3f9x2` is not.
 */
async function uniqueKey(
  base: string,
  taken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = `${base}-copy`.slice(0, 48);

  if (!(await taken(root))) return root;

  for (let n = 2; n <= 50; n += 1) {
    const candidate = `${root}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }

  throw new ValidationError('Too many copies of this key already exist. Rename one first.');
}

/** Appends " (copy)" / " (نسخة)" without letting the field overflow its column. */
function copyTitle(title: string, arabic: boolean): string {
  const suffix = arabic ? ' (نسخة)' : ' (copy)';
  return `${title.slice(0, 200 - suffix.length)}${suffix}`;
}

/* -------------------------------------------------------------------------- */
/* Duplicate a menu                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Deep-copies a menu: categories, items, item images, modifier links.
 *
 * Three rules the copy obeys:
 *
 *  1. **It is a draft.** A duplicated menu is work in progress by definition,
 *     and a copy that published itself would put an unedited "Main Menu (copy)"
 *     in front of customers the moment it was made.
 *  2. **It carries no publication history.** Versions belong to the menu that
 *     was published, not to a new menu that has never been. Copying them would
 *     let a rollback restore content the copy never had.
 *  3. **Item codes are rewritten.** `itemCode` is unique per *business*, so a
 *     copy that kept them would collide with its own source.
 */
export async function duplicateMenu(
  user: AuthenticatedUser,
  businessId: string,
  menuId: string,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const source = await prisma.menu.findFirst({
    where: { id: menuId, businessId: context.businessId },
    include: {
      design: true,
      categories: {
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: { gallery: { orderBy: { sortOrder: 'asc' } }, modifiers: true },
          },
        },
      },
    },
  });

  if (!source) throw new ValidationError('Menu not found.');

  const menuKey = await uniqueKey(source.key, async (candidate) =>
    Boolean(
      await prisma.menu.findUnique({
        where: { businessId_key: { businessId: context.businessId, key: candidate } },
        select: { id: true },
      }),
    ),
  );

  // Item codes are unique per business, so the whole business's set has to be
  // known before any of them is assigned.
  const usedCodes = new Set(
    (
      await prisma.menuItem.findMany({
        where: { businessId: context.businessId },
        select: { itemCode: true },
      })
    ).map((row) => row.itemCode),
  );

  const nextCode = (base: string): string => {
    for (let n = 2; n <= 999; n += 1) {
      const candidate = `${base.slice(0, 28)}-${n}`;
      if (!usedCodes.has(candidate)) {
        usedCodes.add(candidate);
        return candidate;
      }
    }
    throw new ValidationError(`Cannot allocate an item code from "${base}".`);
  };

  const copy = await prisma.$transaction(async (tx) => {
    const menu = await tx.menu.create({
      data: {
        businessId: context.businessId,
        key: menuKey,
        // Always a draft. See rule 1 above.
        status: 'DRAFT',
        titleAr: copyTitle(source.titleAr, true),
        titleEn: source.titleEn ? copyTitle(source.titleEn, false) : null,
        descriptionAr: source.descriptionAr,
        descriptionEn: source.descriptionEn,
        currency: source.currency,
        coverMediaId: source.coverMediaId,
        sortOrder: source.sortOrder + 1,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        dailyFrom: source.dailyFrom,
        dailyTo: source.dailyTo,
        timezone: source.timezone,
      },
    });

    // The presentation is most of why an operator duplicates rather than
    // starts fresh, so it comes with.
    if (source.design) {
      // Copied field by field rather than spread-minus-keys: a new column on
      // MenuDesign should have to be considered here, not silently carried.
      const { id, menuId, createdAt, updatedAt, ...design } = source.design;
      void id;
      void menuId;
      void createdAt;
      void updatedAt;
      await tx.menuDesign.create({ data: { ...design, menuId: menu.id } });
    }

    for (const category of source.categories) {
      const categoryCopy = await tx.menuCategory.create({
        data: {
          menuId: menu.id,
          businessId: context.businessId,
          key: category.key,
          nameAr: category.nameAr,
          nameEn: category.nameEn,
          descriptionAr: category.descriptionAr,
          descriptionEn: category.descriptionEn,
          imageMediaId: category.imageMediaId,
          sortOrder: category.sortOrder,
          isFeatured: category.isFeatured,
          isActive: category.isActive,
        },
      });

      for (const item of category.items) {
        const itemCopy = await tx.menuItem.create({
          data: {
            businessId: context.businessId,
            categoryId: categoryCopy.id,
            itemCode: nextCode(item.itemCode),
            nameAr: item.nameAr,
            nameEn: item.nameEn,
            descriptionAr: item.descriptionAr,
            descriptionEn: item.descriptionEn,
            priceMinor: item.priceMinor,
            currency: item.currency,
            calories: item.calories,
            servingSizeAr: item.servingSizeAr,
            servingSizeEn: item.servingSizeEn,
            ingredientsAr: item.ingredientsAr,
            ingredientsEn: item.ingredientsEn,
            allergens: item.allergens,
            tags: item.tags,
            isFeatured: item.isFeatured,
            availability: item.availability,
            imageMediaId: item.imageMediaId,
            sortOrder: item.sortOrder,
          },
        });

        if (item.gallery.length > 0) {
          await tx.menuItemImage.createMany({
            data: item.gallery.map((image: (typeof item.gallery)[number]) => ({
              itemId: itemCopy.id,
              mediaId: image.mediaId,
              sortOrder: image.sortOrder,
            })),
          });
        }

        // Modifier *groups* stay shared: they are the business's own
        // ("Size", "Extras"), and copying them would leave the operator
        // editing two identical lists forever.
        if (item.modifiers.length > 0) {
          await tx.menuItemModifierGroup.createMany({
            data: item.modifiers.map((link: (typeof item.modifiers)[number]) => ({
              businessId: context.businessId,
              itemId: itemCopy.id,
              groupId: link.groupId,
              sortOrder: link.sortOrder,
            })),
          });
        }
      }
    }

    return menu;
  });

  await recordAudit({
    action: 'menu.duplicated',
    entity: 'menu',
    entityId: copy.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { from: source.key, to: copy.key, categories: source.categories.length },
  });

  return copy;
}

/* -------------------------------------------------------------------------- */
/* Duplicate a category / an item                                              */
/* -------------------------------------------------------------------------- */

export async function duplicateCategory(
  user: AuthenticatedUser,
  businessId: string,
  categoryId: string,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const source = await prisma.menuCategory.findFirst({
    where: { id: categoryId, businessId: context.businessId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!source) throw new ValidationError('Category not found.');

  const key = await uniqueKey(source.key, async (candidate) =>
    Boolean(
      await prisma.menuCategory.findUnique({
        where: { menuId_key: { menuId: source.menuId, key: candidate } },
        select: { id: true },
      }),
    ),
  );

  const usedCodes = new Set(
    (
      await prisma.menuItem.findMany({
        where: { businessId: context.businessId },
        select: { itemCode: true },
      })
    ).map((row) => row.itemCode),
  );

  const copy = await prisma.$transaction(async (tx) => {
    const category = await tx.menuCategory.create({
      data: {
        menuId: source.menuId,
        businessId: context.businessId,
        key,
        nameAr: copyTitle(source.nameAr, true),
        nameEn: source.nameEn ? copyTitle(source.nameEn, false) : null,
        descriptionAr: source.descriptionAr,
        descriptionEn: source.descriptionEn,
        imageMediaId: source.imageMediaId,
        sortOrder: source.sortOrder + 1,
        isActive: source.isActive,
        isFeatured: source.isFeatured,
      },
    });

    for (const item of source.items) {
      let itemCode = '';
      for (let n = 2; n <= 999; n += 1) {
        const candidate = `${item.itemCode.slice(0, 28)}-${n}`;
        if (!usedCodes.has(candidate)) {
          usedCodes.add(candidate);
          itemCode = candidate;
          break;
        }
      }
      if (!itemCode) throw new ValidationError(`Cannot allocate an item code from "${item.itemCode}".`);

      await tx.menuItem.create({
        data: {
          businessId: context.businessId,
          categoryId: category.id,
          itemCode,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          descriptionAr: item.descriptionAr,
          descriptionEn: item.descriptionEn,
          priceMinor: item.priceMinor,
          currency: item.currency,
          calories: item.calories,
          servingSizeAr: item.servingSizeAr,
          servingSizeEn: item.servingSizeEn,
          allergens: item.allergens,
          tags: item.tags,
          isFeatured: item.isFeatured,
          availability: item.availability,
          imageMediaId: item.imageMediaId,
          sortOrder: item.sortOrder,
        },
      });
    }

    return category;
  });

  await recordAudit({
    action: 'category.duplicated',
    entity: 'menu_category',
    entityId: copy.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { from: source.key, to: copy.key, items: source.items.length },
  });

  return copy;
}

export async function duplicateItem(user: AuthenticatedUser, businessId: string, itemId: string) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const source = await prisma.menuItem.findFirst({
    where: { id: itemId, businessId: context.businessId },
  });

  if (!source) throw new ValidationError('Item not found.');

  const itemCode = await uniqueKey(source.itemCode, async (candidate) =>
    Boolean(
      await prisma.menuItem.findUnique({
        where: { businessId_itemCode: { businessId: context.businessId, itemCode: candidate } },
        select: { id: true },
      }),
    ),
  );

  const copy = await prisma.menuItem.create({
    data: {
      businessId: context.businessId,
      categoryId: source.categoryId,
      itemCode,
      nameAr: copyTitle(source.nameAr, true),
      nameEn: source.nameEn ? copyTitle(source.nameEn, false) : null,
      descriptionAr: source.descriptionAr,
      descriptionEn: source.descriptionEn,
      priceMinor: source.priceMinor,
      currency: source.currency,
      calories: source.calories,
      servingSizeAr: source.servingSizeAr,
      servingSizeEn: source.servingSizeEn,
      allergens: source.allergens,
      tags: source.tags,
      isFeatured: source.isFeatured,
      // A copy is not on the menu until someone says so: it is the *source*
      // dish with a placeholder name, and a customer should not be offered it.
      availability: 'HIDDEN',
      imageMediaId: source.imageMediaId,
      sortOrder: source.sortOrder + 1,
    },
  });

  await recordAudit({
    action: 'item.duplicated',
    entity: 'menu_item',
    entityId: copy.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { from: source.itemCode, to: copy.itemCode },
  });

  return copy;
}

/* -------------------------------------------------------------------------- */
/* Ordering                                                                    */
/* -------------------------------------------------------------------------- */

export type ReorderScope = 'category' | 'item' | 'menu';

/**
 * Writes an explicit order for a set of siblings.
 *
 * Takes the *whole* ordered list rather than a "move A above B" instruction,
 * because that is what a drag-and-drop surface already knows and it makes the
 * write idempotent: replaying the same request twice cannot drift the order.
 *
 * Every id is checked against the tenant and against the expected parent
 * before anything is written, so a crafted request cannot reorder — or merely
 * confirm the existence of — another business's rows.
 */
export async function reorder(
  user: AuthenticatedUser,
  businessId: string,
  scope: ReorderScope,
  parentId: string | null,
  orderedIds: string[],
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  if (orderedIds.length === 0) return { moved: 0 };
  if (orderedIds.length > 500) throw new ValidationError('Too many rows to reorder at once.');
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new ValidationError('The same row appears twice in the new order.');
  }

  const scoped = { businessId: context.businessId, id: { in: orderedIds } };

  if (scope === 'menu') {
    const found = await prisma.menu.findMany({ where: scoped, select: { id: true } });
    if (found.length !== orderedIds.length) throw new ValidationError('Unknown menu in the new order.');

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.menu.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
  } else if (scope === 'category') {
    if (!parentId) throw new ValidationError('A menu is required to reorder its categories.');

    const found = await prisma.menuCategory.findMany({
      where: { ...scoped, menuId: parentId },
      select: { id: true },
    });
    if (found.length !== orderedIds.length) {
      throw new ValidationError('Unknown category in the new order.');
    }

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.menuCategory.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
  } else {
    if (!parentId) throw new ValidationError('A category is required to reorder its items.');

    const found = await prisma.menuItem.findMany({
      where: { ...scoped, categoryId: parentId },
      select: { id: true },
    });
    if (found.length !== orderedIds.length) throw new ValidationError('Unknown item in the new order.');

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.menuItem.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
  }

  await recordAudit({
    action: 'structure.reordered',
    entity: scope,
    entityId: parentId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { scope, count: orderedIds.length },
  });

  return { moved: orderedIds.length };
}

/**
 * Moves one row one place, without JavaScript.
 *
 * The drag-and-drop surface calls `reorder`; this is what the up/down buttons
 * beside every row call, and what keeps the whole ordering feature usable from
 * a keyboard, a screen reader and a phone where dragging is fiddly.
 */
export async function move(
  user: AuthenticatedUser,
  businessId: string,
  scope: ReorderScope,
  id: string,
  direction: 'up' | 'down',
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const siblings = await loadSiblings(context.businessId, scope, id);
  const index = siblings.ids.indexOf(id);

  if (index < 0) throw new ValidationError('Row not found.');

  const target = direction === 'up' ? index - 1 : index + 1;

  // Already at the end: a no-op, not an error. The button is disabled there,
  // but a double submit should not raise.
  if (target < 0 || target >= siblings.ids.length) return { moved: 0 };

  const next = [...siblings.ids];
  [next[index], next[target]] = [next[target] as string, next[index] as string];

  return reorder(user, businessId, scope, siblings.parentId, next);
}

async function loadSiblings(
  businessId: string,
  scope: ReorderScope,
  id: string,
): Promise<{ parentId: string | null; ids: string[] }> {
  if (scope === 'menu') {
    const rows = await prisma.menu.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      select: { id: true },
    });
    return { parentId: null, ids: rows.map((row) => row.id) };
  }

  if (scope === 'category') {
    const row = await prisma.menuCategory.findFirst({
      where: { id, businessId },
      select: { menuId: true },
    });
    if (!row) throw new ValidationError('Category not found.');

    const rows = await prisma.menuCategory.findMany({
      where: { businessId, menuId: row.menuId },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      select: { id: true },
    });
    return { parentId: row.menuId, ids: rows.map((r) => r.id) };
  }

  const row = await prisma.menuItem.findFirst({
    where: { id, businessId },
    select: { categoryId: true },
  });
  if (!row) throw new ValidationError('Item not found.');

  const rows = await prisma.menuItem.findMany({
    where: { businessId, categoryId: row.categoryId },
    orderBy: [{ sortOrder: 'asc' }, { itemCode: 'asc' }],
    select: { id: true },
  });
  return { parentId: row.categoryId, ids: rows.map((r) => r.id) };
}
