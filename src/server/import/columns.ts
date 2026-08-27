/**
 * The import/export column contract (master spec §59, §60).
 *
 * Header matching is the difference between a bulk tool staff will use and one
 * they will not: the file that arrives is a restaurant's own spreadsheet, with
 * Arabic headers, inconsistent spacing and occasional English. So each column
 * declares its aliases in both languages, matching is normalised, and whatever
 * the automatic pass gets wrong an operator can correct before importing (§60).
 */

export interface ColumnDefinition {
  /** Canonical field name used everywhere downstream. */
  key: string;
  labelEn: string;
  labelAr: string;
  required: boolean;
  /** Alternate headers seen in real files, in either language. */
  aliases: readonly string[];
  description: string;
}

export const IMPORT_COLUMNS: readonly ColumnDefinition[] = [
  {
    key: 'item_id',
    labelEn: 'item_id',
    labelAr: 'رمز الصنف',
    required: false,
    aliases: ['itemid', 'item code', 'item_code', 'code', 'sku', 'الرمز', 'كود الصنف'],
    description:
      'Stable item code. Present means update that item; empty means create a new one (§66).',
  },
  {
    key: 'category_ar',
    labelEn: 'category_ar',
    labelAr: 'القسم',
    required: true,
    aliases: ['category', 'categoryar', 'section', 'القسم بالعربي', 'التصنيف', 'الفئة'],
    description: 'Category name in Arabic. Required.',
  },
  {
    key: 'category_en',
    labelEn: 'category_en',
    labelAr: 'القسم بالإنجليزي',
    required: false,
    aliases: ['categoryen', 'category english', 'التصنيف الإنجليزي'],
    description: 'Category name in English. Never machine-translated.',
  },
  {
    key: 'item_name_ar',
    labelEn: 'item_name_ar',
    labelAr: 'اسم الصنف',
    required: true,
    aliases: ['name', 'item name', 'itemnamear', 'name_ar', 'الصنف', 'الاسم', 'اسم المنتج'],
    description: 'Item name in Arabic. Required.',
  },
  {
    key: 'item_name_en',
    labelEn: 'item_name_en',
    labelAr: 'اسم الصنف بالإنجليزي',
    required: false,
    aliases: ['itemnameen', 'name_en', 'english name', 'الاسم الإنجليزي'],
    description: 'Item name in English.',
  },
  {
    key: 'description_ar',
    labelEn: 'description_ar',
    labelAr: 'الوصف',
    required: false,
    aliases: ['description', 'descriptionar', 'desc', 'الوصف بالعربي'],
    description: 'Item description in Arabic.',
  },
  {
    key: 'description_en',
    labelEn: 'description_en',
    labelAr: 'الوصف بالإنجليزي',
    required: false,
    aliases: ['descriptionen', 'desc_en'],
    description: 'Item description in English.',
  },
  {
    key: 'price',
    labelEn: 'price',
    labelAr: 'السعر',
    required: true,
    aliases: ['amount', 'cost', 'السعر بالريال', 'سعر'],
    description: 'Price in the business currency. Required.',
  },
  {
    key: 'currency',
    labelEn: 'currency',
    labelAr: 'العملة',
    required: false,
    aliases: ['cur'],
    description: 'Ignored on import: the business currency governs.',
  },
  {
    key: 'calories',
    labelEn: 'calories',
    labelAr: 'السعرات',
    required: false,
    aliases: ['kcal', 'calorie', 'السعرات الحرارية'],
    description: 'Only imported when the business supplied a figure. Never inferred (§37).',
  },
  {
    key: 'serving_size',
    labelEn: 'serving_size',
    labelAr: 'حجم الحصة',
    required: false,
    aliases: ['servingsize', 'portion', 'الحصة'],
    description: 'Serving size, as written.',
  },
  {
    key: 'ingredients_ar',
    labelEn: 'ingredients_ar',
    labelAr: 'المكونات',
    required: false,
    aliases: ['ingredients', 'ingredientsar'],
    description: 'Ingredients in Arabic.',
  },
  {
    key: 'ingredients_en',
    labelEn: 'ingredients_en',
    labelAr: 'المكونات بالإنجليزي',
    required: false,
    aliases: ['ingredientsen'],
    description: 'Ingredients in English.',
  },
  {
    key: 'allergens',
    labelEn: 'allergens',
    labelAr: 'مسببات الحساسية',
    required: false,
    aliases: ['allergen', 'الحساسية'],
    description: 'Comma-separated. Unknown values are reported, not dropped silently (§38).',
  },
  {
    key: 'tags',
    labelEn: 'tags',
    labelAr: 'الوسوم',
    required: false,
    aliases: ['tag', 'labels'],
    description: 'Comma-separated free tags.',
  },
  {
    key: 'image_url',
    labelEn: 'image_url',
    labelAr: 'رابط الصورة',
    required: false,
    aliases: ['image', 'imageurl', 'photo', 'الصورة'],
    description: 'Validated but not fetched during import; a bad URL never fails the row (§70).',
  },
  {
    key: 'featured',
    labelEn: 'featured',
    labelAr: 'مميز',
    required: false,
    aliases: ['is_featured', 'highlight'],
    description: 'TRUE/FALSE, or نعم/لا.',
  },
  {
    key: 'available',
    labelEn: 'available',
    labelAr: 'متوفر',
    required: false,
    aliases: ['availability', 'in_stock', 'الحالة'],
    description: 'TRUE/FALSE, or متوفر/غير متوفر (§69).',
  },
  {
    key: 'sort_order',
    labelEn: 'sort_order',
    labelAr: 'الترتيب',
    required: false,
    aliases: ['sortorder', 'order', 'position', 'ترتيب'],
    description: 'Whole number. Blank means 0.',
  },
  {
    key: 'menu',
    labelEn: 'menu',
    labelAr: 'القائمة',
    required: false,
    aliases: ['menu_key', 'menuname', 'اسم القائمة'],
    description: 'Menu key. Blank uses the menu selected for the import (§74).',
  },
  {
    key: 'branch',
    labelEn: 'branch',
    labelAr: 'الفرع',
    required: false,
    aliases: ['branch_key', 'branchname', 'اسم الفرع'],
    description: 'Branch key. Present means the row sets a branch price override (§73).',
  },
];

export const REQUIRED_COLUMNS = IMPORT_COLUMNS.filter((column) => column.required).map(
  (column) => column.key,
);

/**
 * Normalises a header for comparison: case, surrounding space, Arabic
 * diacritics and the several Unicode forms of alef and yeh that the same word
 * is written with in different files.
 */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    // Arabic diacritics carry no meaning in a column header.
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[آأإا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Best-effort automatic mapping; the operator confirms or corrects it (§60). */
export function autoMapHeaders(headers: readonly string[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  const claimed = new Set<string>();

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;

    const match = IMPORT_COLUMNS.find((column) => {
      if (claimed.has(column.key)) return false;

      const candidates = [column.key, column.labelEn, column.labelAr, ...column.aliases];
      return candidates.some((candidate) => normalizeHeader(candidate) === normalized);
    });

    if (match) {
      mapping[index] = match.key;
      claimed.add(match.key);
    }
  });

  return mapping;
}
