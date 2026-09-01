/**
 * Profile Health — the publishing quality gate (master spec §06, §07, §08, §74).
 *
 * Three rules shape this file:
 *
 *  1. **Three severities, and only one of them blocks.** A missing price is an
 *     ERROR because a menu that cannot be priced is not a menu. A missing
 *     English description is a WARNING, because a business trading only in
 *     Arabic is a real business, not a mistake. An item with no photograph is
 *     INFO. A gate that blocks on everything gets switched off (§07).
 *
 *  2. **Every finding names where to fix it.** A checklist that reports
 *     problems without a route to the screen that solves them is a to-do list,
 *     and the operator's time is spent hunting rather than fixing (§06).
 *
 *  3. **Absence is reported, never invented.** A business that has supplied no
 *     calories has *missing data*; it is never described as compliant, and no
 *     value is ever filled in for it (§05, §107; GOALS I9).
 *
 * The checks are pure functions over a plain input record, so they are fully
 * testable without a database and reusable by the dashboard, the publish
 * screen and any future API.
 */

export type Severity = 'ERROR' | 'WARNING' | 'INFO';

export interface Finding {
  /** Stable identifier, used for tests and for suppression later. */
  code: string;
  severity: Severity;
  /** One line, in the operator's language. Never a field path. */
  message: string;
  /** Which part of Profile Health this belongs to. */
  area: Area;
  /** How many things are affected, when the finding is a count. */
  count?: number;
  /** Path to the screen that fixes it, relative to the business. */
  fixPath?: string;
}

export type Area =
  | 'brand'
  | 'content'
  | 'menu'
  | 'images'
  | 'nutrition'
  | 'links'
  | 'contact'
  | 'hours'
  | 'seo'
  | 'qr'
  | 'downloads'
  | 'publishing';

export const AREAS: readonly Area[] = [
  'brand',
  'content',
  'menu',
  'images',
  'nutrition',
  'links',
  'contact',
  'hours',
  'seo',
  'qr',
  'downloads',
  'publishing',
];

/** Everything the checks need, gathered once by the caller. */
export interface HealthInput {
  businessId: string;
  publicId: string;
  status: string;
  type: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;

  hasLogo: boolean;
  hasOgImage: boolean;
  brandContrast: { text: number; muted: number } | null;

  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  googleMapsUrl: string | null;
  addressAr: string | null;
  socialCount: number;
  hasWorkingHours: boolean;

  indexProfile: boolean;
  metaTitleAr: string | null;
  metaDescriptionAr: string | null;

  branchCount: number;
  branchesMissingAddress: number;

  menus: {
    key: string;
    id: string;
    isPublished: boolean;
    hasUnpublishedChanges: boolean;
    categoryCount: number;
    emptyCategories: string[];
  }[];

  items: {
    itemCode: string;
    nameAr: string;
    nameEn: string | null;
    priceMinor: number | null;
    calories: number | null;
    hasImage: boolean;
    hasImageAlt: boolean;
    descriptionAr: string | null;
    availability: string;
    isFeatured: boolean;
  }[];

  duplicateItemNames: string[];
  externalLinks: { label: string; url: string; status: 'working' | 'broken' | 'unchecked' }[];
  publicFileCount: number;
}

/** Business types for which nutrition information is expected at all (§05). */
const FOOD_TYPES = new Set(['RESTAURANT', 'CAFE', 'BAKERY', 'DESSERT']);

export function isFoodBusiness(type: string): boolean {
  return FOOD_TYPES.has(type);
}

export function evaluateHealth(input: HealthInput): Finding[] {
  const findings: Finding[] = [];
  const base = `/admin/businesses/${input.businessId}`;

  const add = (finding: Finding) => findings.push(finding);

  /* --- Brand ------------------------------------------------------------ */

  if (!input.hasLogo) {
    add({
      code: 'brand.logo_missing',
      severity: 'ERROR',
      area: 'brand',
      message: 'No logo. The brand engine has nothing to read, and the profile has no mark.',
      fixPath: `${base}/brand`,
    });
  }

  if (input.brandContrast && input.brandContrast.text < 4.5) {
    add({
      code: 'brand.text_contrast',
      severity: 'ERROR',
      area: 'brand',
      message: `Body text contrast is ${input.brandContrast.text.toFixed(1)}:1 — below the 4.5:1 needed to be readable.`,
      fixPath: `${base}/brand`,
    });
  }

  if (input.brandContrast && input.brandContrast.muted < 3) {
    add({
      code: 'brand.muted_contrast',
      severity: 'WARNING',
      area: 'brand',
      message: `Secondary text contrast is ${input.brandContrast.muted.toFixed(1)}:1 — hard to read on a phone in daylight.`,
      fixPath: `${base}/brand`,
    });
  }

  /* --- Content and language --------------------------------------------- */

  if (!input.descriptionAr) {
    add({
      code: 'content.description_ar_missing',
      severity: 'WARNING',
      area: 'content',
      message: 'No Arabic description. Arabic is the profile’s primary language.',
      fixPath: base,
    });
  }

  if (!input.nameEn && !input.descriptionEn) {
    add({
      code: 'content.english_absent',
      severity: 'INFO',
      area: 'content',
      message: 'Nothing is written in English. An English visitor will see Arabic throughout.',
      fixPath: base,
    });
  }

  const missingEnglishNames = input.items.filter((item) => !item.nameEn).length;
  if (missingEnglishNames > 0 && input.nameEn) {
    add({
      code: 'content.item_english_missing',
      severity: 'WARNING',
      area: 'content',
      count: missingEnglishNames,
      message: `${missingEnglishNames} item${missingEnglishNames === 1 ? '' : 's'} have no English name, but the business is presented bilingually.`,
      fixPath: `${base}/menus`,
    });
  }

  /* --- Menu ------------------------------------------------------------- */

  if (input.menus.length === 0) {
    add({
      code: 'menu.none',
      severity: 'ERROR',
      area: 'menu',
      message: 'No menu exists. A visitor scanning the QR would find nothing to read.',
      fixPath: `${base}/menus`,
    });
  }

  if (input.items.length === 0 && input.menus.length > 0) {
    add({
      code: 'menu.no_items',
      severity: 'ERROR',
      area: 'menu',
      message: 'The menu has no items.',
      fixPath: `${base}/menus`,
    });
  }

  const missingPrice = input.items.filter(
    (item) => item.priceMinor === null && item.availability !== 'HIDDEN',
  );
  if (missingPrice.length > 0) {
    add({
      code: 'menu.price_missing',
      severity: 'ERROR',
      area: 'menu',
      count: missingPrice.length,
      message: `${missingPrice.length} visible item${missingPrice.length === 1 ? ' has' : 's have'} no price: ${missingPrice
        .slice(0, 3)
        .map((item) => item.nameEn ?? item.nameAr)
        .join(', ')}${missingPrice.length > 3 ? '…' : ''}`,
      fixPath: `${base}/menus`,
    });
  }

  const negativePrice = input.items.filter(
    (item) => item.priceMinor !== null && item.priceMinor < 0,
  ).length;
  if (negativePrice > 0) {
    add({
      code: 'menu.price_invalid',
      severity: 'ERROR',
      area: 'menu',
      count: negativePrice,
      message: `${negativePrice} item${negativePrice === 1 ? ' has' : 's have'} a negative price.`,
      fixPath: `${base}/menus`,
    });
  }

  const emptyCategories = input.menus.flatMap((menu) => menu.emptyCategories);
  if (emptyCategories.length > 0) {
    add({
      code: 'menu.empty_category',
      severity: 'WARNING',
      area: 'menu',
      count: emptyCategories.length,
      message: `${emptyCategories.length} categor${emptyCategories.length === 1 ? 'y is' : 'ies are'} empty: ${emptyCategories.slice(0, 3).join(', ')}.`,
      fixPath: `${base}/menus`,
    });
  }

  if (input.duplicateItemNames.length > 0) {
    add({
      code: 'menu.duplicate_names',
      severity: 'WARNING',
      area: 'menu',
      count: input.duplicateItemNames.length,
      message: `Possible duplicates: ${input.duplicateItemNames.slice(0, 3).join(', ')}. Review rather than merge — two sizes of one dish are not a mistake.`,
      fixPath: `${base}/menus`,
    });
  }

  const unavailableFeatured = input.items.filter(
    (item) => item.isFeatured && item.availability === 'UNAVAILABLE',
  ).length;
  if (unavailableFeatured > 0) {
    add({
      code: 'menu.featured_unavailable',
      severity: 'WARNING',
      area: 'menu',
      count: unavailableFeatured,
      message: `${unavailableFeatured} featured item${unavailableFeatured === 1 ? ' is' : 's are'} marked unavailable — the profile is leading with something nobody can order.`,
      fixPath: `${base}/menus`,
    });
  }

  const missingDescription = input.items.filter((item) => !item.descriptionAr).length;
  if (missingDescription > 0 && input.items.length > 0) {
    add({
      code: 'menu.description_missing',
      severity: 'INFO',
      area: 'menu',
      count: missingDescription,
      message: `${missingDescription} item${missingDescription === 1 ? ' has' : 's have'} no description.`,
      fixPath: `${base}/menus`,
    });
  }

  /* --- Images ----------------------------------------------------------- */

  const withoutImage = input.items.filter((item) => !item.hasImage).length;
  if (withoutImage > 0) {
    add({
      code: 'images.item_missing',
      severity: withoutImage === input.items.length && input.items.length > 0 ? 'WARNING' : 'INFO',
      area: 'images',
      count: withoutImage,
      message:
        withoutImage === input.items.length
          ? 'No item has a photograph. The profile will read as a price list.'
          : `${withoutImage} item${withoutImage === 1 ? ' has' : 's have'} no photograph.`,
      fixPath: `${base}/media`,
    });
  }

  const missingAlt = input.items.filter((item) => item.hasImage && !item.hasImageAlt).length;
  if (missingAlt > 0) {
    add({
      code: 'images.alt_missing',
      severity: 'WARNING',
      area: 'images',
      count: missingAlt,
      message: `${missingAlt} image${missingAlt === 1 ? ' has' : 's have'} no alt text, so a screen reader announces nothing.`,
      fixPath: `${base}/media`,
    });
  }

  /* --- Nutrition (food businesses only) --------------------------------- */

  if (isFoodBusiness(input.type) && input.items.length > 0) {
    const withoutCalories = input.items.filter((item) => item.calories === null).length;

    if (withoutCalories > 0) {
      add({
        code: 'nutrition.calories_missing',
        severity: 'WARNING',
        area: 'nutrition',
        count: withoutCalories,
        message: `${withoutCalories} item${withoutCalories === 1 ? ' has' : 's have'} no calorie figure. Supplied by the business only — the platform never estimates one.`,
        fixPath: `${base}/menus`,
      });
    }
  }

  /* --- Contact and hours ------------------------------------------------ */

  if (!input.phone && !input.whatsapp) {
    add({
      code: 'contact.none',
      severity: 'ERROR',
      area: 'contact',
      message: 'No phone or WhatsApp number. A visitor has no way to reach the business.',
      fixPath: base,
    });
  }

  if (!input.googleMapsUrl && !input.addressAr) {
    add({
      code: 'contact.location_missing',
      severity: 'WARNING',
      area: 'contact',
      message: 'No address and no map link.',
      fixPath: base,
    });
  }

  if (input.socialCount === 0) {
    add({
      code: 'contact.social_none',
      severity: 'INFO',
      area: 'contact',
      message: 'No social links.',
      fixPath: base,
    });
  }

  if (!input.hasWorkingHours) {
    add({
      code: 'hours.missing',
      severity: 'WARNING',
      area: 'hours',
      message: 'No opening hours, so the profile cannot say whether the business is open.',
      fixPath: `${base}/hours`,
    });
  }

  if (input.branchesMissingAddress > 0) {
    add({
      code: 'contact.branch_address_missing',
      severity: 'WARNING',
      area: 'contact',
      count: input.branchesMissingAddress,
      message: `${input.branchesMissingAddress} branch${input.branchesMissingAddress === 1 ? '' : 'es'} have no address.`,
      fixPath: `${base}/branches`,
    });
  }

  /* --- Links ------------------------------------------------------------ */

  const broken = input.externalLinks.filter((link) => link.status === 'broken');
  if (broken.length > 0) {
    add({
      code: 'links.broken',
      severity: 'ERROR',
      area: 'links',
      count: broken.length,
      message: `${broken.length} external link${broken.length === 1 ? ' is' : 's are'} broken: ${broken.map((link) => link.label).join(', ')}.`,
      fixPath: `${base}/files`,
    });
  }

  const unchecked = input.externalLinks.filter((link) => link.status === 'unchecked').length;
  if (unchecked > 0) {
    add({
      code: 'links.unchecked',
      severity: 'INFO',
      area: 'links',
      count: unchecked,
      message: `${unchecked} external link${unchecked === 1 ? ' has' : 's have'} not been checked yet.`,
      fixPath: `${base}/files`,
    });
  }

  /* --- Downloads -------------------------------------------------------- */

  if (input.publicFileCount === 0) {
    add({
      code: 'downloads.none',
      severity: 'INFO',
      area: 'downloads',
      message: 'No downloadable file. A printable PDF menu is often the first thing asked for.',
      fixPath: `${base}/files`,
    });
  }

  /* --- SEO -------------------------------------------------------------- */

  if (input.indexProfile && !input.metaDescriptionAr) {
    add({
      code: 'seo.description_missing',
      severity: 'WARNING',
      area: 'seo',
      message: 'The profile is set to be indexed but has no meta description.',
      fixPath: base,
    });
  }

  if (input.indexProfile && !input.hasOgImage && !input.hasLogo) {
    add({
      code: 'seo.og_image_missing',
      severity: 'WARNING',
      area: 'seo',
      message: 'Nothing to show when the link is shared — no share image and no logo.',
      fixPath: `${base}/media`,
    });
  }

  /* --- Publishing ------------------------------------------------------- */

  const unpublished = input.menus.filter((menu) => !menu.isPublished);
  if (unpublished.length > 0) {
    add({
      code: 'publishing.never_published',
      severity: 'ERROR',
      area: 'publishing',
      count: unpublished.length,
      message: `${unpublished.length} menu${unpublished.length === 1 ? ' has' : 's have'} never been published, so ${unpublished.length === 1 ? 'it is' : 'they are'} invisible to visitors.`,
      fixPath: `${base}/menus`,
    });
  }

  const pending = input.menus.filter((menu) => menu.isPublished && menu.hasUnpublishedChanges);
  if (pending.length > 0) {
    add({
      code: 'publishing.unpublished_changes',
      severity: 'WARNING',
      area: 'publishing',
      count: pending.length,
      message: `${pending.length} menu${pending.length === 1 ? ' has' : 's have'} edits that are not live yet.`,
      fixPath: `${base}/menus/${pending[0]!.id}/versions`,
    });
  }

  if (input.status !== 'ACTIVE') {
    add({
      code: 'publishing.business_not_active',
      severity: 'ERROR',
      area: 'publishing',
      message: `The business is ${input.status.toLowerCase()}, so its public profile returns "not found".`,
      fixPath: base,
    });
  }

  return findings;
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

export interface HealthReport {
  score: number;
  findings: Finding[];
  errors: number;
  warnings: number;
  infos: number;
  /** Whether publishing should be discouraged. Never *prevented* (§07). */
  blocked: boolean;
  byArea: { area: Area; status: 'PASS' | 'INFO' | 'WARNING' | 'ERROR'; findings: Finding[] }[];
}

/**
 * A single percentage, weighted so that severity dominates count.
 *
 * The weighting matters more than the exact numbers: one missing price must
 * cost more than twelve missing photographs, or the score rewards padding a
 * menu with images while leaving it unpriced.
 */
const WEIGHT: Record<Severity, number> = { ERROR: 12, WARNING: 4, INFO: 1 };

export function scoreHealth(findings: Finding[]): HealthReport {
  const penalty = findings.reduce((total, finding) => total + WEIGHT[finding.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  const counted = (severity: Severity) =>
    findings.filter((finding) => finding.severity === severity).length;

  const byArea = AREAS.map((area) => {
    const inArea = findings.filter((finding) => finding.area === area);
    const status = inArea.some((f) => f.severity === 'ERROR')
      ? ('ERROR' as const)
      : inArea.some((f) => f.severity === 'WARNING')
        ? ('WARNING' as const)
        : inArea.length > 0
          ? ('INFO' as const)
          : ('PASS' as const);

    return { area, status, findings: inArea };
  });

  return {
    score,
    findings: [...findings].sort(
      (a, b) => WEIGHT[b.severity] - WEIGHT[a.severity] || a.area.localeCompare(b.area),
    ),
    errors: counted('ERROR'),
    warnings: counted('WARNING'),
    infos: counted('INFO'),
    blocked: counted('ERROR') > 0,
    byArea,
  };
}
