import { describe, expect, it } from 'vitest';
import {
  diffSnapshots,
  isEmptyDiff,
  parseSnapshot,
  summarise,
  type MenuSnapshot,
  type SnapshotItem,
} from '@/server/menus/snapshot';

function item(overrides: Partial<SnapshotItem> & { itemCode: string }): SnapshotItem {
  return {
    nameAr: `صنف ${overrides.itemCode}`,
    nameEn: `Item ${overrides.itemCode}`,
    descriptionAr: null,
    descriptionEn: null,
    priceMinor: 4200,
    currency: 'SAR',
    calories: null,
    servingSizeAr: null,
    servingSizeEn: null,
    ingredientsAr: null,
    ingredientsEn: null,
    allergens: [],
    tags: [],
    costMinor: null,
    imageMediaId: null,
    availability: 'AVAILABLE',
    isFeatured: false,
    sortOrder: 0,
    ...overrides,
  };
}

function snapshot(items: SnapshotItem[], overrides: Partial<MenuSnapshot> = {}): MenuSnapshot {
  return {
    schema: 1,
    titleAr: 'القائمة',
    titleEn: 'Menu',
    design: null,
    categories: [
      {
        key: 'mains',
        nameAr: 'الأطباق',
        nameEn: 'Mains',
        descriptionAr: null,
        descriptionEn: null,
        imageMediaId: null,
        sortOrder: 0,
        isActive: true,
        isFeatured: false,
        parentKey: null,
        items,
      },
    ],
    ...overrides,
  };
}

describe('menu snapshots — parsing', () => {
  it('accepts a well-formed snapshot', () => {
    expect(parseSnapshot(snapshot([item({ itemCode: 'MN-001' })]))).not.toBeNull();
  });

  it('reports an absent snapshot as un-restorable rather than throwing', () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot(undefined)).toBeNull();
  });

  it('refuses a shape from an older release instead of half-reading it', () => {
    expect(parseSnapshot({ schema: 0, categories: [] })).toBeNull();
    expect(parseSnapshot({ categories: 'not an array' })).toBeNull();
  });
});

describe('menu snapshots — diffing', () => {
  it('reports the first publish as everything added', () => {
    const diff = diffSnapshots(null, snapshot([item({ itemCode: 'A' }), item({ itemCode: 'B' })]));

    expect(diff.itemsAdded).toHaveLength(2);
    expect(diff.itemsRemoved).toHaveLength(0);
    expect(diff.categoriesAdded).toEqual(['mains']);
  });

  it('finds a price change and keeps both figures', () => {
    const before = snapshot([item({ itemCode: 'MN-001', priceMinor: 3800 })]);
    const after = snapshot([item({ itemCode: 'MN-001', priceMinor: 4200 })]);

    const diff = diffSnapshots(before, after);

    expect(diff.priceChanges).toEqual([
      {
        itemCode: 'MN-001',
        nameAr: 'صنف MN-001',
        nameEn: 'Item MN-001',
        from: 3800,
        to: 4200,
        currency: 'SAR',
      },
    ]);
  });

  it('treats a rename as a change, not a deletion plus an addition', () => {
    // This is why items match on itemCode: matching on name would report the
    // single most common edit as the two most alarming ones.
    const before = snapshot([item({ itemCode: 'MN-001', nameEn: 'Chicken Burger' })]);
    const after = snapshot([item({ itemCode: 'MN-001', nameEn: 'Grilled Chicken Burger' })]);

    const diff = diffSnapshots(before, after);

    expect(diff.itemsAdded).toHaveLength(0);
    expect(diff.itemsRemoved).toHaveLength(0);
    expect(diff.fieldChanges.map((c) => c.field)).toEqual(['name']);
  });

  it('sees an item removed', () => {
    const diff = diffSnapshots(
      snapshot([item({ itemCode: 'A' }), item({ itemCode: 'B' })]),
      snapshot([item({ itemCode: 'A' })]),
    );

    expect(diff.itemsRemoved.map((i) => i.itemCode)).toEqual(['B']);
  });

  it('distinguishes an image being added from one being removed', () => {
    const added = diffSnapshots(
      snapshot([item({ itemCode: 'A', imageMediaId: null })]),
      snapshot([item({ itemCode: 'A', imageMediaId: 'media-1' })]),
    );
    expect(added.fieldChanges[0]).toMatchObject({
      field: 'image',
      fromLabel: 'No image',
      toLabel: 'Image',
    });

    const removed = diffSnapshots(
      snapshot([item({ itemCode: 'A', imageMediaId: 'media-1' })]),
      snapshot([item({ itemCode: 'A', imageMediaId: null })]),
    );
    expect(removed.fieldChanges[0]).toMatchObject({ fromLabel: 'Image', toLabel: 'No image' });
  });

  it('notices availability changing, which is the urgent edit', () => {
    const diff = diffSnapshots(
      snapshot([item({ itemCode: 'A', availability: 'AVAILABLE' })]),
      snapshot([item({ itemCode: 'A', availability: 'UNAVAILABLE' })]),
    );

    expect(diff.fieldChanges[0]).toMatchObject({
      field: 'availability',
      fromLabel: 'AVAILABLE',
      toLabel: 'UNAVAILABLE',
    });
  });

  it('finds categories added and removed', () => {
    const before = snapshot([item({ itemCode: 'A' })]);
    const after: MenuSnapshot = {
      ...before,
      categories: [
        { ...before.categories[0]!, key: 'drinks' },
      ],
    };

    const diff = diffSnapshots(before, after);

    expect(diff.categoriesAdded).toEqual(['drinks']);
    expect(diff.categoriesRemoved).toEqual(['mains']);
  });

  it('notices a design change even when no content moved', () => {
    const before = snapshot([item({ itemCode: 'A' })], { design: { themeKey: 'linen' } });
    const after = snapshot([item({ itemCode: 'A' })], { design: { themeKey: 'ink' } });

    const diff = diffSnapshots(before, after);

    expect(diff.designChanged).toBe(true);
    expect(diff.priceChanges).toHaveLength(0);
  });

  it('reports a republish with no edits as no change at all', () => {
    const same = snapshot([item({ itemCode: 'A' })]);
    expect(isEmptyDiff(diffSnapshots(same, structuredClone(same)))).toBe(true);
  });

  it('does not mistake reordering for editing', () => {
    const before = snapshot([item({ itemCode: 'A' }), item({ itemCode: 'B' })]);
    const after = snapshot([item({ itemCode: 'B' }), item({ itemCode: 'A' })]);

    const diff = diffSnapshots(before, after);

    expect(diff.itemsAdded).toHaveLength(0);
    expect(diff.itemsRemoved).toHaveLength(0);
    expect(diff.priceChanges).toHaveLength(0);
  });

  it('finds an item that moved between categories without treating it as new', () => {
    const before = snapshot([item({ itemCode: 'A' })]);
    const after: MenuSnapshot = {
      ...before,
      categories: [
        { ...before.categories[0]!, items: [] },
        { ...before.categories[0]!, key: 'drinks', items: [item({ itemCode: 'A' })] },
      ],
    };

    const diff = diffSnapshots(before, after);

    expect(diff.itemsAdded).toHaveLength(0);
    expect(diff.itemsRemoved).toHaveLength(0);
    expect(diff.categoriesAdded).toEqual(['drinks']);
  });
});

describe('menu snapshots — summarising', () => {
  it('counts each kind of change separately', () => {
    const before = snapshot([
      item({ itemCode: 'A', priceMinor: 1000 }),
      item({ itemCode: 'B' }),
      item({ itemCode: 'C', imageMediaId: 'm1' }),
    ]);
    const after = snapshot([
      item({ itemCode: 'A', priceMinor: 1200 }),
      item({ itemCode: 'C', imageMediaId: 'm2' }),
      item({ itemCode: 'D' }),
    ]);

    expect(summarise(diffSnapshots(before, after))).toMatchObject({
      itemsAdded: 1,
      itemsRemoved: 1,
      pricesChanged: 1,
      imagesChanged: 1,
    });
  });

  it('separates image changes from every other field change', () => {
    const before = snapshot([item({ itemCode: 'A', imageMediaId: 'm1', calories: 100 })]);
    const after = snapshot([item({ itemCode: 'A', imageMediaId: 'm2', calories: 200 })]);

    const summary = summarise(diffSnapshots(before, after));

    expect(summary.imagesChanged).toBe(1);
    expect(summary.otherChanges).toBe(1);
  });
});
