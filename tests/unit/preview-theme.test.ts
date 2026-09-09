import { describe, expect, it } from 'vitest';
import { resolveTheme } from '@/menu-studio/themes';
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
      designOverrides: {
        themeKey: 'modern-minimal', layoutKey: 'a',
        fontHeading: null, fontBody: null, fontPrice: null, fontAccent: null,
        imageStyle: 'thumbnail', density: 'airy',
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

  it('keeps the photography and density the operator chose', () => {
    // Swapping theme must not silently discard settings the operator picked on
    // purpose. Only what they left on "theme default" follows the new theme.
    const original = profileFixture();
    original.menus[0]!.designOverrides = {
      ...original.menus[0]!.designOverrides,
      imageStyle: 'polaroid',
      density: 'compact',
      showImages: true,
    };

    const preview = withPreviewTheme(original, 'dark-luxury', 'b');

    expect(preview.menus[0]!.design.imageStyle).toBe('polaroid');
    // dark-luxury is an airy theme; the operator asked for compact and gets it.
    expect(resolveTheme('dark-luxury', 'b').theme.density).toBe('airy');
    expect(preview.menus[0]!.design.density).toBe('compact');
  });

  it('lets the new theme supply every setting left on its default', () => {
    const original = profileFixture();
    original.menus[0]!.designOverrides = {
      ...original.menus[0]!.designOverrides,
      imageStyle: null,
      density: null,
      showImages: true,
    };

    const previewed = withPreviewTheme(original, 'bold-street', 'a').menus[0]!.design;
    const { theme, layout } = resolveTheme('bold-street', 'a');

    expect(previewed.density).toBe(theme.density);
    expect(previewed.imageStyle).toBe(layout.imageStyle);
  });

  it('ignores an unknown theme or variant', () => {
    const original = profileFixture();
    expect(withPreviewTheme(original, 'not-a-theme', 'a')).toBe(original);
    expect(withPreviewTheme(original, 'dark-luxury', 'not-a-layout')).toBe(original);
  });
});
