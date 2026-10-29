'use client';

import { createContext, useContext } from 'react';
import {
  MENU_CATEGORIES,
  MENU_ITEMS,
  RESTAURANT_INFO,
} from './data/menuData';
import type { MenuCategory, MenuItem, RestaurantInfo } from './data/menuData';

/** A restaurant offer, as the menu shows it in its offers strip. */
export interface MenuOffer {
  key: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  image?: string;
  imageSrcSet?: string;
  /** Offer price; absent when the offer has none. */
  price?: number;
  /** Price before the offer, shown struck through. */
  originalPrice?: number;
  discountPercent?: number;
  ctaUrl?: string;
  ctaLabelAr?: string;
  ctaLabelEn?: string;
}

export interface HeroSlide {
  id: string;
  tagAr: string;
  tagEn: string;
  headlineAr: string;
  headlineEn: string;
  subtitleAr: string;
  subtitleEn: string;
  price: number;
  calories?: number;
  prepTimeAr?: string;
  image: string;
  imageSrcSet?: string;
  imagePosition?: string;
}

/**
 * Everything the Sabah components show about *a restaurant*. Each component
 * reads it from here rather than importing the reference fixture, so a
 * restaurant rendered through this template shows its own name, phone,
 * WhatsApp number, logo and dishes — never Sabah El Lail's.
 */
export interface SabahData {
  info: RestaurantInfo;
  categories: MenuCategory[];
  items: MenuItem[];
  logoUrl: string | null;
  slides: HeroSlide[];
  /** QR code for the permanent menu link, as an SVG data URI. */
  qrDataUri: string | null;
  /** Current offers, for the strip in the middle of the menu. */
  offers?: MenuOffer[];
}

const FALLBACK: SabahData = {
  info: RESTAURANT_INFO,
  categories: MENU_CATEGORIES,
  items: MENU_ITEMS,
  logoUrl: '/sabah/assets/menu/logo_crop.png',
  slides: [],
  qrDataUri: null,
};

const SabahDataContext = createContext<SabahData>(FALLBACK);

export const SabahDataProvider = SabahDataContext.Provider;

export function useSabah(): SabahData {
  return useContext(SabahDataContext);
}
