import { describe, expect, it } from 'vitest';
import { appIconPath, menuManifest, parseAppIconFile } from '@/server/profile/install';
import type { PublicProfile } from '@/server/profile/types';

/** A profile with just what the manifest reads. */
function profile(overrides: Partial<Record<string, unknown>> = {}): PublicProfile {
  return {
    publicId: 'DG9PP1',
    nameAr: 'أسد الحمرا البخاري',
    nameEn: 'Asad Al Hamra Bukhari',
    descriptionAr: 'مطعم بخاري',
    descriptionEn: 'A Bukhari restaurant',
    defaultLocale: 'ar',
    logo: null,
    brand: { colorPrimary: '#1f2421', colorBackground: '#fbf9f5' },
    ...overrides,
  } as unknown as PublicProfile;
}

describe('the menu’s install manifest', () => {
  it('names the menu after the restaurant, in the menu’s own language', () => {
    const arabic = menuManifest(profile());
    expect(arabic).toMatchObject({ name: 'أسد الحمرا البخاري', lang: 'ar', dir: 'rtl' });
    const english = menuManifest(profile({ defaultLocale: 'en' }));
    expect(english).toMatchObject({ name: 'Asad Al Hamra Bukhari', lang: 'en', dir: 'ltr' });
  });

  it('is its own app: each restaurant has its own id, start address and scope', () => {
    const m = menuManifest(profile());
    expect(m).toMatchObject({ id: '/m/DG9PP1', start_url: '/m/DG9PP1', scope: '/m/DG9PP1', display: 'standalone' });
  });

  it('keeps two restaurants’ installs apart: different ids, names, icons and colours', () => {
    const first = menuManifest(profile());
    const second = menuManifest(
      profile({
        publicId: 'SBH001',
        nameAr: 'مطعم صباح الليل',
        nameEn: 'Sabah El Lail',
        brand: { colorPrimary: '#0f5132', colorBackground: '#101512' },
      }),
    );
    expect(second.id).not.toBe(first.id);
    expect(second.start_url).toBe('/m/SBH001');
    expect(second.name).toBe('مطعم صباح الليل');
    expect(second.theme_color).toBe('#0f5132');
    expect(second.icons.map((icon) => icon.src)).toEqual(['/m/SBH001/app-icon/192.png', '/m/SBH001/app-icon/512.png']);
    expect(first.icons.map((icon) => icon.src)).toEqual(['/m/DG9PP1/app-icon/192.png', '/m/DG9PP1/app-icon/512.png']);
  });

  it('uses the restaurant’s colours', () => {
    expect(menuManifest(profile())).toMatchObject({ theme_color: '#1f2421', background_color: '#fbf9f5' });
  });

  it('keeps the home-screen label short', () => {
    const short = menuManifest(profile({ nameAr: 'مطعم' })).short_name;
    expect(short).toBe('مطعم');
    const long = menuManifest(profile({ nameEn: 'The Very Long Restaurant Name Here' }));
    // Defaults to the Arabic name; a long Arabic name is cut with an ellipsis.
    expect(long.short_name.length).toBeLessThanOrEqual(12);
    expect(menuManifest(profile({ nameAr: 'مطعم الشواية الذهبية الكبير جدا' })).short_name.endsWith('…')).toBe(true);
  });

  it('always offers the two PNG sizes a browser installs with, rendered from the logo by this app', () => {
    const withLogo = menuManifest(
      profile({ logo: { url: 'https://cdn.example.com/logo.webp', width: 512, height: 512 } }),
    );
    expect(withLogo.icons).toEqual([
      { src: '/m/DG9PP1/app-icon/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/m/DG9PP1/app-icon/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ]);
    // The raw logo address never becomes an icon: it could be any shape or size.
    expect(withLogo.icons.some((icon) => icon.src.includes('cdn.example.com'))).toBe(false);

    const withoutLogo = menuManifest(profile());
    expect(withoutLogo.icons.map((icon) => icon.src)).toEqual(['/m/DG9PP1/app-icon/192.png', '/m/DG9PP1/app-icon/512.png']);
  });
});

describe('the install icon addresses', () => {
  it('builds one address per size under the menu', () => {
    expect(appIconPath('DG9PP1', 192)).toBe('/m/DG9PP1/app-icon/192.png');
  });

  it('accepts only the two sizes, as PNG names', () => {
    expect(parseAppIconFile('192.png')).toBe(192);
    expect(parseAppIconFile('512.png')).toBe(512);
    expect(parseAppIconFile('100.png')).toBeNull();
    expect(parseAppIconFile('192.jpg')).toBeNull();
    expect(parseAppIconFile('192')).toBeNull();
    expect(parseAppIconFile('../192.png')).toBeNull();
    expect(parseAppIconFile('1920.png')).toBeNull();
  });
});
