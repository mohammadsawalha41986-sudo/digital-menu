import type { PublicProfile } from '@/server/profile/types';
import type {
  MenuCategory,
  MenuItem,
  RestaurantInfo,
} from './sabah/data/menuData';

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

  const itemsAll: MenuItem[] = profile.menus.flatMap((menu) =>
    menu.categories.flatMap((category) =>
      category.items
        .filter((item) => !item.isUnavailable)
        .map((item) => ({
          id: item.code,
          nameAr: item.nameAr,
          nameEn: item.nameEn ?? item.nameAr,
          categoryId: category.key,
          price: (item.priceMinor ?? 0) / 100,
          calories: item.calories ?? undefined,
          descriptionAr: item.descriptionAr ?? undefined,
          descriptionEn: item.descriptionEn ?? item.descriptionAr ?? undefined,
          image: item.image?.url ?? undefined,
          isPopular: item.isFeatured,
          isOffer: item.tags?.includes('offer') ?? false,
          isSpicyOption: item.tags?.includes('spicy') ?? false,
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
    googleMapsUrl: profile.contact.googleMapsUrl ?? '',
    openingHoursAr: '',
    openingHoursEn: '',
    serviceOptionsAr: [],
    serviceOptionsEn: [],
  };

  return { restaurantInfo, menuCategories, menuItems: itemsAll };
}
