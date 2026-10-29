'use client';

import { createContext, useContext } from 'react';
import {
  MENU_CATEGORIES,
  MENU_ITEMS,
  RESTAURANT_INFO,
} from './data/menuData';
import type { MenuCategory, MenuItem, RestaurantInfo } from './data/menuData';

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
