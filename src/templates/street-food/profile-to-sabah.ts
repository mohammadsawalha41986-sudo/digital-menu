import { minorUnitDigits } from '@/lib/money';
import type { PublicOffer, PublicProfile } from '@/server/profile/types';
import type {
  MenuCategory,
  MenuItem,
  RestaurantInfo,
} from './sabah/data/menuData';
import type { HeroSlide } from './sabah/context';

/**
 * Map the platform's `PublicProfile` shape into the shape the Sabah El Lail
 * reference app expects.
 *
 * The app was authored against a hand-written `menuData.ts` with items keyed
 * by stable string ids and categories identified by `categoryId`. The
 * platform's menus use nested categories with their own items. This function
 * flattens that structure and translates the fields, so the app renders any
 * restaurant whose template is `street-food` through its own composition
 * — hero, chip rail, grid, cart, reviews, maps and all — reading from the
 * live database rather than from the bundled fixture.
 *
 * Fields the app expects but the platform does not model (reviewCount,
 * rating, service options text, opening hours string) use thin, honest
 * fallbacks derived from what IS modelled, labelled as such.
 */
export function profileToSabah(profile: PublicProfile): {
  restaurantInfo: RestaurantInfo;
  menuCategories: MenuCategory[];
  menuItems: MenuItem[];
  logoUrl: string | null;
  slides: HeroSlide[];
} {
  const categoriesAll = profile.menus.flatMap((menu) =>
    menu.categories.map((category) => ({
      id: category.key,
      nameAr: category.nameAr,
      nameEn: category.nameEn ?? category.nameAr,
      icon: 'Utensils',
      image: category.image?.url ?? undefined,
      descriptionAr: category.descriptionAr ?? undefined,
      descriptionEn: category.descriptionEn ?? category.descriptionAr ?? undefined,
    })),
  );

  // Minor units to a decimal amount in the restaurant's own currency: three
  // decimals for KWD, BHD and OMR, two elsewhere.
  const toAmount = (minor: number | null) => (minor ?? 0) / 10 ** minorUnitDigits(profile.currency);

  const itemsAll: MenuItem[] = profile.menus.flatMap((menu) =>
    menu.categories.flatMap((category) =>
      // Unavailable dishes stay on the menu, marked, rather than vanishing
      // (master spec §83): a regular looking for one learns it is out today.
      category.items
        .map((item) => ({
          id: item.code,
          nameAr: item.nameAr,
          nameEn: item.nameEn ?? item.nameAr,
          categoryId: category.key,
          price: toAmount(item.priceMinor),
          calories: item.calories ?? undefined,
          descriptionAr: item.descriptionAr ?? undefined,
          descriptionEn: item.descriptionEn ?? item.descriptionAr ?? undefined,
          image: item.image?.url ?? undefined,
          isPopular: item.isFeatured,
          isOffer: item.tags?.includes('offer') ?? false,
          isSpicyOption: item.tags?.includes('spicy') ?? false,
          isUnavailable: item.isUnavailable,
          // No price stored: shown without one, never as 0.00 (GOALS I9).
          noPrice: item.priceMinor === null,
        })),
    ),
  );

  // Keep only categories that actually have items — the app hides empty
  // sections anyway, but a chip rail chip pointing at no items reads broken.
  const nonEmptyCategoryKeys = new Set(itemsAll.map((item) => item.categoryId));
  const menuCategories = categoriesAll.filter((category) =>
    nonEmptyCategoryKeys.has(category.id),
  );

  const whatsapp = profile.contact.whatsapp?.replace(/[^0-9]/g, '') ?? '';
  const phone = profile.contact.phone?.replace(/[^0-9+]/g, '') ?? '';
  const nameAr = profile.nameAr;
  const nameEn = profile.nameEn ?? profile.nameAr;

  const restaurantInfo: RestaurantInfo = {
    nameAr,
    nameEn,
    sloganAr: profile.descriptionAr ?? '',
    sloganEn: profile.descriptionEn ?? profile.descriptionAr ?? '',
    phone,
    phoneFormatted: phone,
    whatsappNumber: whatsapp,
    addressAr: profile.contact.addressAr ?? '',
    addressEn: profile.contact.addressEn ?? profile.contact.addressAr ?? '',
    // Landmark text is a Sabah-specific nicety that the platform does not
    // model yet; leave it blank rather than invent one.
    landmarkAr: '',
    landmarkEn: '',
    city: '',
    // Reviews are not in the public profile shape today — the UI falls back
    // to zero so the card can hide its number instead of printing a lie.
    rating: 0,
    reviewCount: 0,
    // Without a stored map link, a search for the restaurant's own name and
    // address is still an honest way to find it.
    googleMapsUrl:
      profile.contact.googleMapsUrl ??
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [nameAr, profile.contact.addressAr].filter(Boolean).join(' '),
      )}`,
    openingHoursAr: '',
    openingHoursEn: '',
    serviceOptionsAr: [],
    serviceOptionsEn: [],
    currency: profile.currency,
    workingHours: profile.contact.workingHours,
  };

  return {
    restaurantInfo,
    menuCategories,
    menuItems: itemsAll,
    logoUrl: profile.logo?.url ?? null,
    slides: [
      ...offerSlides(profile.offers, toAmount),
      ...buildSlides(restaurantInfo, itemsAll.filter((item) => !item.isUnavailable)),
    ].slice(0, 6),
  };
}

/**
 * Hero slides come from the restaurant's own dishes: featured ones with a
 * photo first, then any other photographed dish, four at most. A restaurant
 * with no photographs gets one slide carrying its own name and description
 * over a plain background — never another restaurant's food.
 */
function buildSlides(info: RestaurantInfo, items: MenuItem[]): HeroSlide[] {
  const photographed = items.filter((item) => item.image);
  const ordered = [
    ...photographed.filter((item) => item.isPopular),
    ...photographed.filter((item) => !item.isPopular),
  ].slice(0, 4);

  if (ordered.length === 0) {
    return [
      {
        id: '',
        tagAr: '',
        tagEn: '',
        headlineAr: info.nameAr,
        headlineEn: info.nameEn,
        subtitleAr: info.sloganAr,
        subtitleEn: info.sloganEn,
        price: 0,
        image: '',
      },
    ];
  }

  return ordered.map((item) => ({
    id: item.id,
    tagAr: item.isPopular ? 'طبق مميز' : '',
    tagEn: item.isPopular ? 'Featured' : '',
    headlineAr: item.nameAr,
    headlineEn: item.nameEn,
    subtitleAr: item.descriptionAr ?? '',
    subtitleEn: item.descriptionEn ?? '',
    price: item.price,
    calories: item.calories,
    image: item.image ?? '',
  }));
}

/**
 * The restaurant's own offers lead the hero, ahead of dishes: an offer is what
 * the owner most wants a visitor to see first. Only offers with a photograph
 * qualify — the hero is a picture — and expired ones are dropped.
 */
function offerSlides(offers: PublicOffer[], toAmount: (minor: number | null) => number): HeroSlide[] {
  const now = Date.now();

  return offers
    .filter((offer) => offer.image && (!offer.endsAt || new Date(offer.endsAt).getTime() > now))
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured))
    .slice(0, 3)
    .map((offer) => ({
      id: `offer:${offer.key}`,
      tagAr: offer.discountPercent ? `خصم ${offer.discountPercent}%` : 'عرض',
      tagEn: offer.discountPercent ? `${offer.discountPercent}% off` : 'Offer',
      headlineAr: offer.titleAr,
      headlineEn: offer.titleEn ?? offer.titleAr,
      subtitleAr: offer.descriptionAr ?? '',
      subtitleEn: offer.descriptionEn ?? offer.descriptionAr ?? '',
      price: offer.offerPriceMinor === null ? 0 : toAmount(offer.offerPriceMinor),
      image: offer.image?.url ?? '',
    }));
}
