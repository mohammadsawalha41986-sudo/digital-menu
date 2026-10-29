import type { CartItem } from './types';

/**
 * The visitor's cart, kept in localStorage under one key per restaurant.
 *
 * Every restaurant is served from the same origin, so a shared key would
 * carry restaurant A's dishes into restaurant B's cart — and from there into
 * B's WhatsApp. Read through `useSyncExternalStore`: the server and the
 * hydrating render both see an empty cart, and the stored one appears right
 * after, so the HTML never disagrees.
 */
const EMPTY: CartItem[] = [];
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: CartItem[] }>();

function read(key: string): CartItem[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return EMPTY;
  }

  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value;

  let value: CartItem[] = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    value = Array.isArray(parsed) ? (parsed as CartItem[]) : EMPTY;
  } catch {
    value = EMPTY;
  }

  cache.set(key, { raw, value });
  return value;
}

export function cartStorageKey(publicId: string): string {
  return `menu-cart:${publicId}`;
}

export function subscribeToCart(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function getCart(key: string): CartItem[] {
  return read(key);
}

export function getServerCart(): CartItem[] {
  return EMPTY;
}

export function setCart(key: string, update: (previous: CartItem[]) => CartItem[]): void {
  const next = update(read(key));
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the cart still works for this page view.
    cache.set(key, { raw: JSON.stringify(next), value: next });
  }
  for (const listener of listeners) listener();
}
