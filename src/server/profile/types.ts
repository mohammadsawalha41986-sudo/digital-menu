import type { Locale } from '@/i18n/config';
import type { BrandTokens } from '@/design/brand';

/**
 * The read model a public profile renders from.
 *
 * Shaped deliberately: it carries no internal database ids. A template cannot
 * leak one into markup because it never receives one (master spec §122).
 */

export interface PublicMenuSummary {
  /** Tenant-scoped key such as "main" — safe to expose, not a database id. */
  key: string;
  titleAr: string;
  titleEn: string | null;
  /** Publication number of the version currently served, if published. */
  publishedVersion: number | null;
  publishedAt: Date | null;
}

export interface PublicProfile {
  /** The permanent public identifier the QR encodes. */
  publicId: string;
  businessType: string;
  defaultLocale: Locale;

  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;

  /** Structure selection, resolved against the in-code template registry. */
  templateKey: string;
  variantKey: string;

  /** Visual identity, emitted as CSS custom properties. */
  brand: BrandTokens;

  menus: PublicMenuSummary[];
}
