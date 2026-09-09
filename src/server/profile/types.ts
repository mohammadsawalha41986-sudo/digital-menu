import type { DesignRowLike } from '@/menu-studio/resolve';
import type { Locale } from '@/i18n/config';
import type { BrandTokens } from '@/design/brand';
import type { WorkingHours } from '@/server/business/hours';

/**
 * HERO    — one offer, given the top of the page, inside or beside the hero.
 * BANNER  — a slim full-width strip; several may run at once.
 * SECTION — the ordinary offers block, further down.
 * FEATURED— the default: the offers section, but promoted within it.
 */
export type OfferPlacement = 'HERO' | 'BANNER' | 'SECTION' | 'FEATURED';

/**
 * The read model a public profile renders from.
 *
 * Shaped deliberately: it carries no internal database ids. A template cannot
 * leak one into markup because it never receives one (master spec §122).
 * Branch price and availability overrides are already applied, so a template
 * never has to know the override rules (§86).
 */

export interface PublicImage {
  url: string;
  altAr: string | null;
  altEn: string | null;
  width: number | null;
  height: number | null;
  /** `srcset` for the generated widths, or null when none exist (§50). */
  srcSet: string | null;
  /**
   * CSS `object-position` from the image's focal point (§47, §48). This is
   * what lets one upload serve 1:1, 4:5 and 16:9 without the operator
   * uploading three copies — the browser crops, and this says what to keep.
   */
  objectPosition: string;
}

export interface PublicItem {
  /** Business-scoped item code — stable, not a database id. */
  code: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  /** Minor units, branch override already applied. */
  priceMinor: number | null;
  currency: string;
  /** Only present when the business supplied it. Never inferred (§37). */
  calories: number | null;
  servingSizeAr: string | null;
  servingSizeEn: string | null;
  ingredientsAr: string | null;
  ingredientsEn: string | null;
  allergens: string[];
  tags: string[];
  isFeatured: boolean;
  /** True when the item is served but currently out (§83). */
  isUnavailable: boolean;
  image: PublicImage | null;
  gallery: PublicImage[];
}

export interface PublicCategory {
  key: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  image: PublicImage | null;
  isFeatured: boolean;
  items: PublicItem[];
}

export interface PublicMenuDesign {
  themeKey: string;
  layoutKey: string;
  /** Resolved font stacks, already chosen between design override and theme. */
  fonts: { heading: string; body: string; price: string; accent: string };
  imageStyle: string;
  density: string;
  categoryStyle: string;
  priceStyle: string;
  itemStyle: string;
  borders: string;
  headingTransform: string;
  headingTracking: string;
  scale: number;
  showPrices: boolean;
  showImages: boolean;
  showCalories: boolean;
}

export interface PublicMenu {
  key: string;
  titleAr: string;
  titleEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  /** The menu's own currency when it overrides the business's. */
  currency: string;
  cover: PublicImage | null;
  publishedVersion: number | null;
  publishedAt: Date | null;
  categories: PublicCategory[];
  /** Presentation for this menu. Never null: an unstyled menu is a bug. */
  design: PublicMenuDesign;
  /**
   * The stored choices `design` was resolved from, kept so a staff preview can
   * swap the theme while honouring the typography, photography and density the
   * operator actually picked. The public renderer reads `design`; nothing is
   * serialised from here to a visitor.
   */
  designOverrides: DesignRowLike;
}

export interface PublicBranch {
  key: string;
  nameAr: string;
  nameEn: string | null;
  addressAr: string | null;
  addressEn: string | null;
  phone: string | null;
  whatsapp: string | null;
  googleMapsUrl: string | null;
  workingHours: WorkingHours | null;
}

/** Contact channels. A null field means the action is hidden, not disabled (§44). */
export interface PublicContact {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  facebook: string | null;
  linkedin: string | null;
  youtube: string | null;
  googleMapsUrl: string | null;
  addressAr: string | null;
  addressEn: string | null;
  /**
   * Parsed, not raw JSON. The read model is where a stored shape becomes a
   * rendered one; a template should never be handed something it has to
   * validate before it can draw it.
   */
  workingHours: WorkingHours | null;
}

export interface PublicSeo {
  indexProfile: boolean;
  metaTitleAr: string | null;
  metaTitleEn: string | null;
  metaDescriptionAr: string | null;
  metaDescriptionEn: string | null;
  ogImage: PublicImage | null;
}

export interface PublicProfile {
  /** The permanent public identifier the QR encodes. */
  publicId: string;
  businessType: string;
  defaultLocale: Locale;
  currency: string;

  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  logo: PublicImage | null;

  /** Structure selection, resolved against the in-code template registry. */
  templateKey: string;
  variantKey: string;
  /** Visual identity, emitted as CSS custom properties. */
  brand: BrandTokens;

  contact: PublicContact;
  seo: PublicSeo;
  showPlatformFooter: boolean;

  branches: PublicBranch[];
  /** The branch this view is scoped to, when the URL named one. */
  activeBranchKey: string | null;
  /**
   * Set when the visitor is on a single menu's own page,
   * `/m/{publicId}/menu/{menuKey}`. `menus` then holds exactly that menu, so
   * templates need no special case: they render the menus they are given.
   */
  activeMenuKey: string | null;

  menus: PublicMenu[];
  offers: PublicOffer[];
  downloads: PublicDownload[];
}

export interface PublicOffer {
  key: string;
  titleAr: string;
  titleEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  image: PublicImage | null;
  originalPriceMinor: number | null;
  offerPriceMinor: number | null;
  discountPercent: number | null;
  currency: string;
  ctaLabelAr: string | null;
  ctaLabelEn: string | null;
  ctaUrl: string | null;
  /**
   * Where the template should place this offer. Not a hint: each value gets a
   * genuinely different presentation, which is the whole reason the column
   * exists (master spec §115, §35).
   */
  placement: OfferPlacement;
  isFeatured: boolean;
  endsAt: Date | null;
}

export interface PublicDownload {
  key: string;
  titleAr: string;
  titleEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  /** Either a hosted file served by the platform or an external link (§51). */
  kind: 'file' | 'link';
  url: string;
  fileSizeBytes: number | null;
  contentType: string | null;
  allowDownload: boolean;
}
