import type { MenuItem } from './data/menuData';
import type { ChosenGroup } from './choices';

export type Language = 'ar' | 'en';

export interface CartItem {
  cartItemId: string;
  item: MenuItem;
  selectedOption?: {
    nameAr: string;
    nameEn: string;
    price: number;
  };
  /** The restaurant's choices as the customer made them. */
  choices?: ChosenGroup[];
  spiceLevel?: 'normal' | 'spicy';
  extraCheese?: boolean;
  extraGarlic?: boolean;
  extraSpicyGarlic?: boolean;
  extraHummus?: boolean;
  notes?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export type OrderType = 'takeaway' | 'dineIn' | 'delivery';
