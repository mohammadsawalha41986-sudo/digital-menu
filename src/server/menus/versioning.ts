import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import {
  diffSnapshots,
  isEmptyDiff,
  parseSnapshot,
  summarise,
  type MenuSnapshot,
  type SnapshotCategory,
} from './snapshot';

/**
 * Reading, writing and restoring menu snapshots.
 *
 * Kept apart from `snapshot.ts` on purpose: that file is pure and testable
 * without a database, this one is the part that touches Prisma. The split is
 * what lets the diff logic — the part with the interesting edge cases — be
 * covered by unit tests in an environment with no Postgres.
 */

type Client = PrismaClient | Prisma.TransactionClient;

/** Reads the menu's *current* content into a snapshot document. */
export async function captureSnapshot(tx: Client, menuId: string): Promise<MenuSnapshot> {
  const menu = await tx.menu.findUniqueOrThrow({
    where: { id: menuId },
    select: {
      titleAr: true,
      titleEn: true,
      design: true,
      categories: {
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
        select: {
          key: true,
          nameAr: true,
          nameEn: true,
          descriptionAr: true,
          descriptionEn: true,
          imageMediaId: true,
          sortOrder: true,
          isActive: true,
          isFeatured: true,
          parent: { select: { key: true } },
          items: {
            orderBy: [{ sortOrder: 'asc' }, { itemCode: 'asc' }],
            select: {
              itemCode: true,
              nameAr: true,
              nameEn: true,
              descriptionAr: true,
              descriptionEn: true,
              priceMinor: true,
              currency: true,
              calories: true,
              servingSizeAr: true,
              servingSizeEn: true,
              ingredientsAr: true,
              ingredientsEn: true,
              allergens: true,
              tags: true,
              costMinor: true,
              imageMediaId: true,
              availability: true,
              isFeatured: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });

  return {
    schema: 1,
    titleAr: menu.titleAr,
    titleEn: menu.titleEn,
    design: menu.design ? (JSON.parse(JSON.stringify(menu.design)) as Record<string, unknown>) : null,
    categories: menu.categories.map((category) => ({
      key: category.key,
      nameAr: category.nameAr,
      nameEn: category.nameEn,
      descriptionAr: category.descriptionAr,
      descriptionEn: category.descriptionEn,
      imageMediaId: category.imageMediaId,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      isFeatured: category.isFeatured,
      parentKey: category.parent?.key ?? null,
      items: category.items,
    })),
  };
}

/** The snapshot of whatever version is currently live, or null. */
export async function currentSnapshot(tx: Client, menuId: string): Promise<MenuSnapshot | null> {
  const menu = await tx.menu.findUnique({
    where: { id: menuId },
    select: { currentVersion: { select: { snapshot: true } } },
  });

  return parseSnapshot(menu?.currentVersion?.snapshot);
}

/**
 * What a publish would change — the draft-versus-live comparison (§9, §10).
 *
 * Reads only; safe to call from a page render.
 */
export async function pendingChanges(tx: Client, menuId: string) {
  const [live, draft] = await Promise.all([
    currentSnapshot(tx, menuId),
    captureSnapshot(tx, menuId),
  ]);

  const diff = diffSnapshots(live, draft);

  return { diff, summary: summarise(diff), hasChanges: !isEmptyDiff(diff), live, draft };
}

/**
 * Writes the snapshot and summary onto a version row.
 *
 * Separated from the publish transaction so both publishing and restoring use
 * the same code — a rollback is a publish whose content happens to be old.
 */
export async function writeVersionContent(
  tx: Client,
  versionId: string,
  menuId: string,
  previous: MenuSnapshot | null,
) {
  const snapshot = await captureSnapshot(tx, menuId);
  const diff = diffSnapshots(previous, snapshot);

  await tx.menuVersion.update({
    where: { id: versionId },
    data: {
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      summary: summarise(diff) as unknown as Prisma.InputJsonValue,
    },
  });

  return { snapshot, diff };
}

/**
 * Replaces a menu's live content with a snapshot's.
 *
 * Deliberately destructive within the menu and nowhere else: categories and
 * items belonging to this menu are deleted and rewritten from the document, so
 * restoring is exact rather than a merge that leaves rows nobody asked for.
 * Everything outside the menu — the business, its branches, its files, its QR,
 * its analytics — is untouched, which is what makes rollback safe to offer.
 *
 * Image references are restored by id and skipped when the medium has since
 * been deleted: a version must not resurrect a file the business removed.
 */
export async function applySnapshot(
  tx: Client,
  menuId: string,
  businessId: string,
  snapshot: MenuSnapshot,
) {
  const mediaIds = new Set<string>();
  for (const category of snapshot.categories) {
    if (category.imageMediaId) mediaIds.add(category.imageMediaId);
    for (const item of category.items) {
      if (item.imageMediaId) mediaIds.add(item.imageMediaId);
    }
  }

  const surviving = new Set(
    (
      await tx.media.findMany({
        where: { id: { in: [...mediaIds] }, businessId },
        select: { id: true },
      })
    ).map((row) => row.id),
  );

  const liveMedia = (id: string | null) => (id && surviving.has(id) ? id : null);

  // Items cascade from categories, so one delete clears the tree.
  await tx.menuCategory.deleteMany({ where: { menuId } });

  await tx.menu.update({
    where: { id: menuId },
    data: { titleAr: snapshot.titleAr, titleEn: snapshot.titleEn },
  });

  // Parents first: a child category needs its parent's new id to exist.
  const parents = snapshot.categories.filter((category) => category.parentKey === null);
  const children = snapshot.categories.filter((category) => category.parentKey !== null);
  const idByKey = new Map<string, string>();

  const create = async (category: SnapshotCategory, parentId: string | null) => {
    const row = await tx.menuCategory.create({
      data: {
        menuId,
        businessId,
        key: category.key,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        descriptionAr: category.descriptionAr,
        descriptionEn: category.descriptionEn,
        imageMediaId: liveMedia(category.imageMediaId),
        sortOrder: category.sortOrder,
        isActive: category.isActive,
        isFeatured: category.isFeatured,
        parentId,
      },
      select: { id: true },
    });

    idByKey.set(category.key, row.id);

    if (category.items.length > 0) {
      await tx.menuItem.createMany({
        data: category.items.map((item) => ({
          categoryId: row.id,
          businessId,
          itemCode: item.itemCode,
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
          costMinor: item.costMinor,
          imageMediaId: liveMedia(item.imageMediaId),
          availability: item.availability,
          isFeatured: item.isFeatured,
          sortOrder: item.sortOrder,
        })),
      });
    }
  };

  for (const category of parents) await create(category, null);
  for (const category of children) {
    // A parent that no longer exists in the snapshot leaves the child at the
    // top level rather than failing the restore.
    await create(category, idByKey.get(category.parentKey as string) ?? null);
  }

  if (snapshot.design) {
    // Identity and timestamps belong to the row, not to the design: carrying
    // them over would try to rewrite a primary key.
    const design = Object.fromEntries(
      Object.entries(snapshot.design as Record<string, unknown>).filter(
        ([key]) => !['id', 'menuId', 'createdAt', 'updatedAt'].includes(key),
      ),
    );

    await tx.menuDesign.upsert({
      where: { menuId },
      update: design as Prisma.MenuDesignUpdateInput,
      create: { ...(design as object), menuId } as unknown as Prisma.MenuDesignCreateInput,
    });
  }
}
