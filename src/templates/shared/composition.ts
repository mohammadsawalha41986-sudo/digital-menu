import type { Dictionary } from '@/i18n/dictionary';
import type { Locale } from '@/i18n/config';
import type {
  PublicCategory,
  PublicItem,
  PublicOffer,
  PublicProfile,
} from '@/server/profile/types';
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
  /**
   * Offers split by where the business asked for them. A template reads the
   * slot it has a design for and ignores the rest — but every slot has a
   * design in every family, so the choice always changes the page.
   */
  offers: OfferPlacements;
}

export interface OfferPlacements {
  /** At most one. A second HERO offer would be two heroes, which is none. */
  hero: PublicOffer | null;
  /** Slim strips. Order is the order they were authored in. */
  banners: PublicOffer[];
  /** Everything destined for the offers block, promoted entries first. */
  section: PublicOffer[];
}

/**
 * Splitting rule, and why it is not a plain `groupBy`:
 *
 * HERO is singular by construction — the first one wins and any others fall
 * back to the section, because silently dropping an offer a business
 * published would be worse than placing it somewhere sensible. FEATURED and
 * SECTION share the offers block, with FEATURED sorted first, so `FEATURED`
 * keeps meaning "promoted" rather than becoming a fourth location.
 */
export function splitOffersByPlacement(offers: PublicOffer[]): OfferPlacements {
  let hero: PublicOffer | null = null;
  const banners: PublicOffer[] = [];
  const promoted: PublicOffer[] = [];
  const ordinary: PublicOffer[] = [];

  for (const offer of offers) {
    switch (offer.placement) {
      case 'HERO':
        if (hero === null) hero = offer;
        else promoted.push(offer);
        break;
      case 'BANNER':
        banners.push(offer);
        break;
      case 'FEATURED':
        promoted.push(offer);
        break;
      default:
        ordinary.push(offer);
    }
  }

  return { hero, banners, section: [...promoted, ...ordinary] };
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
    offers: splitOffersByPlacement(profile.offers),
  };
}
