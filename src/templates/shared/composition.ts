import type { Dictionary } from '@/i18n/dictionary';
import type { Locale } from '@/i18n/config';
import type { PublicCategory, PublicItem, PublicProfile } from '@/server/profile/types';
import { buildContactActions, buildSocialLinks, type ContactAction, type SocialLink } from './primitives';

/**
 * Data preparation shared by every template family.
 *
 * This is deliberately *only* data. Structure — what a hero is, whether
 * categories are tabs or a rule-separated index, whether an item is a row, a
 * card or a full-bleed band — belongs to each template and is what makes them
 * genuinely different (master spec §23; GOALS I6).
 *
 * Sharing the derivations means a new family is a composition exercise, not a
 * re-implementation of contact links and featured-item selection.
 */

export interface TemplateComposition {
  contactActions: ContactAction[];
  socialLinks: SocialLink[];
  /** Every category across every published menu, in order. */
  categories: PublicCategory[];
  /** Items the business marked featured, for templates that lead with one. */
  featured: PublicItem[];
  /** Total item count, used to decide between dense and generous layouts. */
  itemCount: number;
  hasOffers: boolean;
  hasDownloads: boolean;
}

export function composeProfile(
  profile: PublicProfile,
  _locale: Locale,
  dictionary: Dictionary,
): TemplateComposition {
  const categories = profile.menus.flatMap((menu) => menu.categories);
  const items = categories.flatMap((category) => category.items);

  return {
    contactActions: buildContactActions(profile.contact, dictionary),
    socialLinks: buildSocialLinks(profile.contact),
    categories,
    featured: items.filter((item) => item.isFeatured),
    itemCount: items.length,
    hasOffers: profile.offers.length > 0,
    hasDownloads: profile.downloads.length > 0,
  };
}
