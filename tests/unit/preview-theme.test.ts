import { describe, expect, it } from 'vitest';
import { withPreviewTheme } from '@/server/profile/preview-theme';
import type { PublicProfile } from '@/server/profile/types';

function profileFixture(): PublicProfile {
  return {
    publicId: 'DEMO1234',
    businessType: 'RESTAURANT',
    defaultLocale: 'ar',
    currency: 'SAR',
    nameAr: 'مطعم تجريبي',
    nameEn: 'Demo restaurant',
    descriptionAr: null,
    descriptionEn: null,
    templateKey: 'modern',
    variantKey: 'a',
    showPlatformFooter: false,
    logo: null,
    brand: {} as PublicProfile['brand'],
    branches: [],
    activeBranchKey: null,
    activeMenuKey: 'main',
    contact: {} as PublicProfile['contact'],
    offers: [],
    downloads: [],
    seo: {} as PublicProfile['seo'],
    menus: [{
      key: 'main',
      titleAr: 'القائمة',
      titleEn: 'Menu',
      descriptionAr: null,
      descriptionEn: null,
      currency: 'SAR',
      cover: null,
      publishedVersion: 2,
      publishedAt: new Date('2026-01-01T00:00:00Z'),
      categories: [{
        key: 'mains',
        nameAr: 'الرئيسية',
        nameEn: 'Mains',
        descriptionAr: null,
        descriptionEn: null,
        image: null,
        isFeatured: false,
        items: [],
      }],
      design: {
        themeKey: 'modern-minimal', layoutKey: 'a', fonts: { heading: 'old', body: 'old', price: 'old', accent: 'old' },
        imageStyle: 'thumbnail', density: 'regular', categoryStyle: 'rule', priceStyle: 'trailing', itemStyle: 'row',
        borders: 'hairline', headingTransform: 'none', headingTracking: 'normal', scale: 1,
        showPrices: true, showImages: false, showCalories: true,
      },
    }],
  };
}

describe('staff theme preview', () => {
  it('changes presentation without changing menu content or visibility choices', () => {
    const original = profileFixture();
    const preview = withPreviewTheme(original, 'dark-luxury', 'b');

    expect(preview).not.toBe(original);
    expect(preview.menus[0]!.design).toMatchObject({
      themeKey: 'dark-luxury',
      layoutKey: 'b',
      showPrices: true,
      showImages: false,
      showCalories: true,
    });
    expect(preview.menus[0]!.categories).toBe(original.menus[0]!.categories);
    expect(original.menus[0]!.design.themeKey).toBe('modern-minimal');
  });

  it('ignores an unknown theme or variant', () => {
    const original = profileFixture();
    expect(withPreviewTheme(original, 'not-a-theme', 'a')).toBe(original);
    expect(withPreviewTheme(original, 'dark-luxury', 'not-a-layout')).toBe(original);
  });
});
