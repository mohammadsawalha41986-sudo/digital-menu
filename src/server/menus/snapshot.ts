import { z } from 'zod';

/**
 * Menu version snapshots (master spec §84, §85; completion Phase 7).
 *
 * A published version used to be a *number* — `version`, `publishedAt`,
 * `publishedBy` and nothing else. That records that a publish happened while
 * preserving nothing to go back to, which makes three things impossible at
 * once: rollback (§85), a change summary (§84), and a draft-versus-live diff
 * (§9, §10).
 *
 * So a version now carries the menu as it stood when it was published.
 *
 * Why a JSON document rather than versioned rows: a menu is read as a whole
 * and restored as a whole, and the alternative — soft-deleting and re-pointing
 * every category and item on every publish — turns each publish into hundreds
 * of writes and every public read into a filtered join. The snapshot is
 * written once per publish and read only when someone looks at history.
 *
 * The shape is validated on the way *out* as well as in. A snapshot written by
 * an older release must never crash the history screen: `parseSnapshot`
 * returns null instead, and the UI says the version cannot be previewed.
 */

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

const snapshotItemSchema = z.object({
  itemCode: z.string(),
  nameAr: z.string(),
  nameEn: z.string().nullable(),
  descriptionAr: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  priceMinor: z.number().int().nullable(),
  currency: z.string(),
  calories: z.number().int().nullable(),
  servingSizeAr: z.string().nullable(),
  servingSizeEn: z.string().nullable(),
  ingredientsAr: z.string().nullable(),
  ingredientsEn: z.string().nullable(),
  allergens: z.array(z.string()),
  tags: z.array(z.string()),
  costMinor: z.number().int().nullable(),
  imageMediaId: z.string().nullable(),
  availability: z.enum(['AVAILABLE', 'UNAVAILABLE', 'SEASONAL', 'HIDDEN']),
  isFeatured: z.boolean(),
  sortOrder: z.number().int(),
});

const snapshotCategorySchema = z.object({
  key: z.string(),
  nameAr: z.string(),
  nameEn: z.string().nullable(),
  descriptionAr: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  imageMediaId: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  /** Parent *key*, not id: ids do not survive a restore, keys do. */
  parentKey: z.string().nullable(),
  items: z.array(snapshotItemSchema),
});

/**
 * The menu's own design row travels with the snapshot, so restoring a version
 * restores how it looked as well as what it said (§85). Kept loose on purpose:
 * the studio adds design fields over time, and a snapshot must not become
 * unreadable because a later release grew a column.
 */
const snapshotDesignSchema = z.record(z.string(), z.unknown()).nullable();

export const menuSnapshotSchema = z.object({
  /** Bumped only when the shape changes incompatibly. */
  schema: z.literal(1),
  titleAr: z.string(),
  titleEn: z.string().nullable(),
  categories: z.array(snapshotCategorySchema),
  design: snapshotDesignSchema,
});

export type MenuSnapshot = z.infer<typeof menuSnapshotSchema>;
export type SnapshotCategory = z.infer<typeof snapshotCategorySchema>;
export type SnapshotItem = z.infer<typeof snapshotItemSchema>;

/** Reads a stored snapshot, or null when it is absent or from an older shape. */
export function parseSnapshot(value: unknown): MenuSnapshot | null {
  const result = menuSnapshotSchema.safeParse(value);
  return result.success ? result.data : null;
}

/* -------------------------------------------------------------------------- */
/* Change summary                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What changed between two versions, in the terms an operator thinks in.
 *
 * Items are matched by `itemCode` because that is the identifier that already
 * survives an Excel round trip — matching by name would report a rename as a
 * deletion plus an addition, which is exactly the report nobody wants.
 */
export interface PriceChange {
  itemCode: string;
  nameAr: string;
  nameEn: string | null;
  from: number | null;
  to: number | null;
  currency: string;
}

export interface FieldChange {
  itemCode: string;
  nameAr: string;
  nameEn: string | null;
  field: 'image' | 'availability' | 'description' | 'calories' | 'featured' | 'name';
  fromLabel: string | null;
  toLabel: string | null;
}

export interface MenuDiff {
  itemsAdded: { itemCode: string; nameAr: string; nameEn: string | null }[];
  itemsRemoved: { itemCode: string; nameAr: string; nameEn: string | null }[];
  priceChanges: PriceChange[];
  fieldChanges: FieldChange[];
  categoriesAdded: string[];
  categoriesRemoved: string[];
  designChanged: boolean;
  titleChanged: boolean;
}

export interface DiffSummary {
  itemsAdded: number;
  itemsRemoved: number;
  pricesChanged: number;
  imagesChanged: number;
  otherChanges: number;
  categoriesAdded: number;
  categoriesRemoved: number;
  designChanged: boolean;
}

function itemsOf(snapshot: MenuSnapshot): Map<string, SnapshotItem> {
  const items = new Map<string, SnapshotItem>();
  for (const category of snapshot.categories) {
    for (const item of category.items) items.set(item.itemCode, item);
  }
  return items;
}

function identify(item: SnapshotItem) {
  return { itemCode: item.itemCode, nameAr: item.nameAr, nameEn: item.nameEn };
}

/**
 * Compares two snapshots. `before` may be null — the first publish of a menu
 * has nothing to compare against, and reporting every item as "added" there is
 * both true and useless, so callers can suppress it.
 */
export function diffSnapshots(before: MenuSnapshot | null, after: MenuSnapshot): MenuDiff {
  const diff: MenuDiff = {
    itemsAdded: [],
    itemsRemoved: [],
    priceChanges: [],
    fieldChanges: [],
    categoriesAdded: [],
    categoriesRemoved: [],
    designChanged: false,
    titleChanged: false,
  };

  if (!before) {
    diff.itemsAdded = [...itemsOf(after).values()].map(identify);
    diff.categoriesAdded = after.categories.map((category) => category.key);
    return diff;
  }

  const oldItems = itemsOf(before);
  const newItems = itemsOf(after);

  for (const [code, item] of newItems) {
    const previous = oldItems.get(code);

    if (!previous) {
      diff.itemsAdded.push(identify(item));
      continue;
    }

    if (previous.priceMinor !== item.priceMinor) {
      diff.priceChanges.push({
        ...identify(item),
        from: previous.priceMinor,
        to: item.priceMinor,
        currency: item.currency,
      });
    }

    const field = (
      name: FieldChange['field'],
      fromLabel: string | null,
      toLabel: string | null,
    ) => diff.fieldChanges.push({ ...identify(item), field: name, fromLabel, toLabel });

    if (previous.imageMediaId !== item.imageMediaId) {
      field(
        'image',
        previous.imageMediaId ? 'Image' : 'No image',
        item.imageMediaId ? 'Image' : 'No image',
      );
    }
    if (previous.availability !== item.availability) {
      field('availability', previous.availability, item.availability);
    }
    if (previous.calories !== item.calories) {
      field('calories', previous.calories?.toString() ?? null, item.calories?.toString() ?? null);
    }
    if (previous.isFeatured !== item.isFeatured) {
      field('featured', previous.isFeatured ? 'Featured' : 'Not featured', item.isFeatured ? 'Featured' : 'Not featured');
    }
    if (previous.nameAr !== item.nameAr || previous.nameEn !== item.nameEn) {
      field('name', previous.nameEn ?? previous.nameAr, item.nameEn ?? item.nameAr);
    }
    if (
      previous.descriptionAr !== item.descriptionAr ||
      previous.descriptionEn !== item.descriptionEn
    ) {
      field('description', 'Changed', 'Changed');
    }
  }

  for (const [code, item] of oldItems) {
    if (!newItems.has(code)) diff.itemsRemoved.push(identify(item));
  }

  const oldCategories = new Set(before.categories.map((category) => category.key));
  const newCategories = new Set(after.categories.map((category) => category.key));

  diff.categoriesAdded = [...newCategories].filter((key) => !oldCategories.has(key));
  diff.categoriesRemoved = [...oldCategories].filter((key) => !newCategories.has(key));

  diff.designChanged = JSON.stringify(before.design ?? null) !== JSON.stringify(after.design ?? null);
  diff.titleChanged = before.titleAr !== after.titleAr || before.titleEn !== after.titleEn;

  return diff;
}

/** The counts shown beside a version in the history list. */
export function summarise(diff: MenuDiff): DiffSummary {
  const images = diff.fieldChanges.filter((change) => change.field === 'image').length;

  return {
    itemsAdded: diff.itemsAdded.length,
    itemsRemoved: diff.itemsRemoved.length,
    pricesChanged: diff.priceChanges.length,
    imagesChanged: images,
    otherChanges: diff.fieldChanges.length - images,
    categoriesAdded: diff.categoriesAdded.length,
    categoriesRemoved: diff.categoriesRemoved.length,
    designChanged: diff.designChanged,
  };
}

/** True when nothing at all differs — a republish with no edits. */
export function isEmptyDiff(diff: MenuDiff): boolean {
  return (
    diff.itemsAdded.length === 0 &&
    diff.itemsRemoved.length === 0 &&
    diff.priceChanges.length === 0 &&
    diff.fieldChanges.length === 0 &&
    diff.categoriesAdded.length === 0 &&
    diff.categoriesRemoved.length === 0 &&
    !diff.designChanged &&
    !diff.titleChanged
  );
}
