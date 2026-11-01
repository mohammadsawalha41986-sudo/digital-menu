/**
 * Automatic suggestions ("complete your meal"): what a dish is offered with,
 * worked out from what each section is, not picked at random.
 *
 * A section has a role: a main dish, a side, a drink, a dessert, or other.
 * The role is the restaurant's own choice when it has made one; otherwise it
 * is read from the section's names. A dish's suggestions follow from its role:
 * a main suggests a drink, a side and a dessert; a side suggests a drink and a
 * dessert; a drink suggests a side and a dessert; a dessert suggests a drink.
 * One dish per role, the featured one first, then the restaurant's own order.
 *
 * Manual picks always win: a dish with its own picks is not given suggestions.
 * A dish that is unavailable, has no price, or is hidden is never suggested.
 */

export const ROLES = ['MAIN', 'SIDE', 'DRINK', 'DESSERT', 'OTHER'] as const;
export type SectionRole = (typeof ROLES)[number];

export const isSectionRole = (value: unknown): value is SectionRole =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);

/** Lower-case, with Arabic letter forms folded so spelling variants match. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

// Checked in this order: a drinks section that also says "extras" is a drink.
const KEYWORDS: { role: SectionRole; words: string[] }[] = [
  {
    role: 'DRINK',
    words: [
      'مشروب', 'عصير', 'عصاير', 'عصائر', 'ماء', 'مياه', 'بيبسي', 'كولا', 'سفن', 'ميرندا', 'كينزا', 'ماونتن', 'قهوه', 'شاي',
      'اسبريسو', 'تقطير', 'لبن', 'drink', 'beverage', 'juice', 'water', 'pepsi', 'cola', '7up', 'sprite', 'fanta', 'kinza',
      'coffee', 'tea', 'espresso', 'filter',
    ],
  },
  {
    role: 'DESSERT',
    words: [
      'حلي', 'حلويات', 'حلوي', 'كنافه', 'بسبوسه', 'ايس كريم', 'مثلجات', 'كيك', 'dessert', 'sweet', 'kunafa', 'ice cream',
      'cake', 'brownie',
    ],
  },
  {
    role: 'SIDE',
    words: [
      'سلطه', 'سلطات', 'مقبلات', 'بطاطس', 'بطاطا', 'فتوش', 'تبوله', 'حمص', 'متبل', 'صوص', 'صلصه', 'مخلل', 'فلافل',
      'salad', 'appetizer', 'starter', 'fries', 'potato', 'side', 'hummus', 'fattoush', 'tabbouleh', 'falafel', 'sauce',
      'pickle',
    ],
  },
  {
    role: 'MAIN',
    words: [
      'دجاج', 'شواي', 'مشاوي', 'مشويات', 'شاورما', 'برجر', 'بروستد', 'لحم', 'كباب', 'مندي', 'بخاري', 'كبسه', 'بيتزا',
      'وجبه', 'ساندويش', 'سندويش', 'ساندويت', 'كومبو', 'عرض', 'ايدام', 'رئيس', 'chicken', 'grill', 'shawarma', 'burger',
      'meat', 'kebab', 'main',
      'kabsa', 'mandi', 'bukhari', 'meal', 'sandwich', 'broasted', 'pizza', 'combo',
    ],
  },
];

/** The role a section reads as from its key and names, before any override. */
export function inferRole(...names: (string | null | undefined)[]): SectionRole {
  const text = normalise(names.filter(Boolean).join(' '));
  for (const { role, words } of KEYWORDS) {
    if (words.some((word) => text.includes(normalise(word)))) return role;
  }
  return 'OTHER';
}

/** The role in effect: the restaurant's stored choice, else what the names say. */
export function effectiveRole(stored: string | null | undefined, ...names: (string | null | undefined)[]): SectionRole {
  return isSectionRole(stored) ? stored : inferRole(...names);
}

const TARGETS: Record<SectionRole, SectionRole[]> = {
  MAIN: ['DRINK', 'SIDE', 'DESSERT'],
  SIDE: ['DRINK', 'DESSERT'],
  DRINK: ['SIDE', 'DESSERT'],
  DESSERT: ['DRINK'],
  OTHER: ['DRINK'],
};

export interface SuggestionCandidate {
  id: string;
  role: SectionRole;
  featured: boolean;
  /** The restaurant's own order: lower comes first. */
  order: number;
  /** Available, priced, and visible on the menu. */
  orderable: boolean;
}

/**
 * The dishes suggested with `dish`, at most `max`, one per target role.
 * Deterministic: the same menu always gives the same suggestions.
 */
export function suggestionsFor(
  dish: Pick<SuggestionCandidate, 'id' | 'role'>,
  pool: SuggestionCandidate[],
  max = 3,
): string[] {
  const picked: string[] = [];
  for (const role of TARGETS[dish.role]) {
    const best = pool
      .filter((candidate) => candidate.id !== dish.id && candidate.role === role && candidate.orderable)
      .sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) || a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )[0];
    if (best && !picked.includes(best.id)) picked.push(best.id);
    if (picked.length >= max) break;
  }
  return picked;
}
