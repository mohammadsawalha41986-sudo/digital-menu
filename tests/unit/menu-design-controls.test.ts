import { describe, expect, it } from 'vitest';
import { brandTokensToStyle, menuTone } from '@/design/brand';
import { brandSchema } from '@/server/admin/validation';

const BASE = {
  colorPrimary: '#059669',
  colorSecondary: '#065F46',
  colorAccent: '#F59E0B',
  colorBackground: '#FBF9F5',
  colorSurface: '#FFFFFF',
  colorText: '#16181A',
  colorMuted: '#6B7280',
  colorBorder: '#E5E1D8',
  fontHeading: 'system-sans',
  fontBody: 'system-sans',
  radiusScale: 'lg',
};

describe('menu design controls', () => {
  it('emits text-size and spacing scales, defaulting to 1', () => {
    const plain = brandTokensToStyle(BASE) as Record<string, string>;
    expect(plain['--brand-text-scale']).toBe('1');
    expect(plain['--brand-spacing-scale']).toBe('1');

    const tuned = brandTokensToStyle({ ...BASE, textScale: 'lg', spacing: 'compact' }) as Record<string, string>;
    expect(Number(tuned['--brand-text-scale'])).toBeGreaterThan(1);
    expect(Number(tuned['--brand-spacing-scale'])).toBeLessThan(1);
  });

  it('emits page, card and price colours only when the owner set them', () => {
    const automatic = brandTokensToStyle(BASE) as Record<string, string>;
    expect(automatic['--brand-menu-page']).toBeUndefined();
    expect(automatic['--brand-menu-price']).toBeUndefined();

    const chosen = brandTokensToStyle({ ...BASE, menuPage: '#FAF7F2', menuPrice: '#B91C1C' }) as Record<string, string>;
    expect(chosen['--brand-menu-page']).toBe('#FAF7F2');
    expect(chosen['--brand-menu-price']).toBe('#B91C1C');
  });

  it('turns the menu light only for a light page colour', () => {
    expect(menuTone({ menuPage: null })).toBe('dark');
    expect(menuTone({ menuPage: '#1E1B4B' })).toBe('dark');
    expect(menuTone({ menuPage: '#FAF7F2' })).toBe('light');
  });

  it('reads an empty colour from the form as "automatic"', () => {
    const parsed = brandSchema.parse({ ...BASE, menuPage: '', menuCard: '#111111', textScale: 'sm' });
    expect(parsed.menuPage).toBeNull();
    expect(parsed.menuCard).toBe('#111111');
    expect(parsed.spacing).toBe('regular');
  });

  it('refuses a value the design does not offer', () => {
    expect(brandSchema.safeParse({ ...BASE, imageShape: 'circle' }).success).toBe(false);
    expect(brandSchema.safeParse({ ...BASE, menuPrice: 'red' }).success).toBe(false);
  });
});

describe('layout and motion settings', () => {
  it('accepts a full, reordered section list and refuses a partial or repeated one', () => {
    const order = ['offers', 'hero', 'menu', 'location', 'reviews'];
    expect(brandSchema.parse({ ...BASE, sectionOrder: order }).sectionOrder).toEqual(order);
    expect(brandSchema.safeParse({ ...BASE, sectionOrder: ['hero', 'menu'] }).success).toBe(false);
    expect(brandSchema.safeParse({ ...BASE, sectionOrder: ['hero', 'hero', 'menu', 'offers', 'reviews'] }).success).toBe(false);
  });

  it('keeps offers inside the menu unless the form says otherwise', () => {
    expect(brandSchema.parse(BASE).offersInsideMenu).toBe(true);
    expect(brandSchema.parse({ ...BASE, offersInsideMenu: 'false' }).offersInsideMenu).toBe(false);
  });

  it('accepts only the effects and backgrounds the design draws', () => {
    expect(brandSchema.parse({ ...BASE, heroEffect: 'story', dishEffect: 'shine', backgroundStyle: 'aurora' })).toMatchObject({
      heroEffect: 'story',
      dishEffect: 'shine',
      backgroundStyle: 'aurora',
    });
    expect(brandSchema.safeParse({ ...BASE, heroEffect: 'explode' }).success).toBe(false);
    expect(brandSchema.safeParse({ ...BASE, backgroundStyle: 'video' }).success).toBe(false);
  });
});
