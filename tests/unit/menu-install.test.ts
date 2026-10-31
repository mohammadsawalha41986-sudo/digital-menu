import { describe, expect, it } from 'vitest';
import { menuManifest } from '@/server/profile/install';
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

  it('uses the restaurant’s logo as its icon, or the platform icon when there is none', () => {
    const withLogo = menuManifest(
      profile({ logo: { url: 'https://cdn.example.com/logo.webp', width: 512, height: 512 } }),
    );
    expect(withLogo.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512']);
    expect(withLogo.icons.every((icon) => icon.src === 'https://cdn.example.com/logo.webp')).toBe(true);

    const withoutLogo = menuManifest(profile());
    expect(withoutLogo.icons).toEqual([
      expect.objectContaining({ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }),
    ]);
  });
});
