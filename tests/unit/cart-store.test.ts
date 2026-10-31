import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cartStorageKey, getCart, getServerCart, setCart } from '@/templates/street-food/sabah/cart-store';
import type { CartItem } from '@/templates/street-food/sabah/types';

function line(id: string): CartItem {
  return {
    cartItemId: `${id}-1`,
    item: { id, nameAr: id, nameEn: id, categoryId: 'c', price: 10 },
    quantity: 1,
    unitPrice: 10,
    totalPrice: 10,
  };
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
});

describe('menu cart store', () => {
  it('keeps each restaurant’s cart apart', () => {
    setCart(cartStorageKey('AAA111'), () => [line('A-1')]);

    expect(getCart(cartStorageKey('AAA111')).map((l) => l.item.id)).toEqual(['A-1']);
    expect(getCart(cartStorageKey('BBB222'))).toEqual([]);
  });

  it('returns the same array until the cart changes, as useSyncExternalStore requires', () => {
    const key = cartStorageKey('AAA111');
    setCart(key, () => [line('A-1')]);
    expect(getCart(key)).toBe(getCart(key));

    const before = getCart(key);
    setCart(key, (previous) => [...previous, line('A-2')]);
    expect(getCart(key)).not.toBe(before);
    expect(getCart(key)).toHaveLength(2);
  });

  it('renders an empty cart on the server so hydration matches', () => {
    expect(getServerCart()).toEqual([]);
  });

  it('survives a corrupt stored value', () => {
    localStorage.setItem(cartStorageKey('CCC333'), '{not json');
    expect(getCart(cartStorageKey('CCC333'))).toEqual([]);
  });
});
