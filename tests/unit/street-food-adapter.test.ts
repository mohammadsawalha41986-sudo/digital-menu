import { describe, expect, it } from 'vitest';
import { profileToSabah } from '@/templates/street-food/profile-to-sabah';
import { RESTAURANT_INFO } from '@/templates/street-food/sabah/data/menuData';
import type { PublicItem, PublicProfile } from '@/server/profile/types';

/**
 * The Street Food template began life as one restaurant's app. These tests
 * pin that another restaurant rendered through it sees only its own data:
 * a stale fixture value here would send customers' WhatsApp orders to the
 * wrong business or show a rating nobody gave.
 */

function item(overrides: Partial<PublicItem>): PublicItem {
  return {
    code: 'X-1',
    nameAr: 'صنف',
    nameEn: 'Dish',
    descriptionAr: null,
    descriptionEn: null,
    priceMinor: 1500,
    currency: 'SAR',
    calories: null,
    servingSizeAr: null,
    servingSizeEn: null,
    ingredientsAr: null,
    ingredientsEn: null,
    allergens: [],
    tags: [],
    pairsWith: [],
    modifiers: [],
    isFeatured: false,
    isUnavailable: false,
    image: null,
    gallery: [],
    ...overrides,
  };
}

function image(url: string) {
  return { url, altAr: null, altEn: null, width: null, height: null, srcSet: null, objectPosition: '50% 50%' };
}

function profile(items: PublicItem[]): PublicProfile {
  return {
    publicId: 'OTHER1',
    businessType: 'RESTAURANT',
    defaultLocale: 'ar',
    currency: 'SAR',
    nameAr: 'مطعم آخر',
    nameEn: 'Another Place',
    descriptionAr: 'وصف',
    descriptionEn: 'About',
    templateKey: 'street-food',
    variantKey: 'a',
    showPlatformFooter: false,
    logo: image('/uploads/other-logo.png'),
    brand: {} as PublicProfile['brand'],
    branches: [],
    activeBranchKey: null,
    activeMenuKey: null,
    contact: {
      phone: '+966 55 123 4567',
      whatsapp: '+966 50 111 2222',
      addressAr: 'جدة',
      addressEn: 'Jeddah',
      googleMapsUrl: 'https://maps.example/other',
    } as PublicProfile['contact'],
    offers: [],
    downloads: [],
    seo: {} as PublicProfile['seo'],
    menus: [
      {
        key: 'main',
        titleAr: 'القائمة',
        titleEn: 'Menu',
        descriptionAr: null,
        descriptionEn: null,
        currency: 'SAR',
        cover: null,
        publishedVersion: 1,
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        categories: [
          {
            key: 'mains',
            nameAr: 'الرئيسية',
            nameEn: 'Mains',
            descriptionAr: null,
            descriptionEn: null,
            image: null,
            isFeatured: false,
            items,
          },
        ],
      } as PublicProfile['menus'][number],
    ],
  };
}

describe('profileToSabah', () => {
  it("uses the restaurant's own WhatsApp and phone, never the reference restaurant's", () => {
    const { restaurantInfo } = profileToSabah(profile([item({})]));

    expect(restaurantInfo.whatsappNumber).toBe('966501112222');
    expect(restaurantInfo.whatsappNumber).not.toBe(RESTAURANT_INFO.whatsappNumber);
    expect(restaurantInfo.phone).toBe('+966551234567');
    expect(restaurantInfo.nameAr).toBe('مطعم آخر');
  });

  it('reports no rating, so invented reviews and stars stay hidden', () => {
    const { restaurantInfo } = profileToSabah(profile([item({})]));

    expect(restaurantInfo.rating).toBe(0);
    expect(restaurantInfo.reviewCount).toBe(0);
  });

  it("builds hero slides from the restaurant's own photographed dishes, featured first", () => {
    const { slides, logoUrl } = profileToSabah(
      profile([
        item({ code: 'A', nameAr: 'عادي', image: image('/u/a.png') }),
        item({ code: 'B', nameAr: 'مميز', isFeatured: true, image: image('/u/b.png') }),
        item({ code: 'C', nameAr: 'بلا صورة' }),
      ]),
    );

    expect(logoUrl).toBe('/uploads/other-logo.png');
    expect(slides.map((slide) => slide.id)).toEqual(['B', 'A']);
    expect(slides.every((slide) => !slide.image.includes('/sabah/'))).toBe(true);
  });

  it('falls back to one plain slide with the restaurant name when there are no photographs', () => {
    const { slides } = profileToSabah(profile([item({})]));

    expect(slides).toHaveLength(1);
    expect(slides[0]?.headlineAr).toBe('مطعم آخر');
    expect(slides[0]?.image).toBe('');
    expect(slides[0]?.price).toBe(0);
  });

  it('keeps an unavailable dish on the menu, marked, and out of the hero (§83)', () => {
    const { menuItems, menuCategories, slides } = profileToSabah(
      profile([item({ code: 'GONE', isUnavailable: true, isFeatured: true, image: image('/u/g.png') })]),
    );

    expect(menuItems.map((dish) => [dish.id, dish.isUnavailable])).toEqual([['GONE', true]]);
    expect(menuCategories).toHaveLength(1);
    expect(slides.map((slide) => slide.id)).not.toContain('GONE');
  });

  it('converts prices with the currency’s own decimals', () => {
    const kuwaiti = profile([item({ priceMinor: 1250, currency: 'KWD' })]);
    kuwaiti.currency = 'KWD';

    const { menuItems, restaurantInfo } = profileToSabah(kuwaiti);

    expect(restaurantInfo.currency).toBe('KWD');
    expect(menuItems[0]?.price).toBe(1.25);
    expect(profileToSabah(profile([item({ priceMinor: 1250 })])).menuItems[0]?.price).toBe(12.5);
  });

  it('falls back to a map search for the restaurant when no map link is stored', () => {
    const withoutMap = profile([item({})]);
    withoutMap.contact = { ...withoutMap.contact, googleMapsUrl: null };

    const { restaurantInfo } = profileToSabah(withoutMap);

    expect(restaurantInfo.googleMapsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
    expect(decodeURIComponent(restaurantInfo.googleMapsUrl)).toContain('مطعم آخر');
  });

  it('leads the hero with current photographed offers, never expired ones', () => {
    const offer = (key: string, overrides: Partial<PublicProfile['offers'][number]>) =>
      ({
        key,
        titleAr: `عرض ${key}`,
        titleEn: null,
        descriptionAr: null,
        descriptionEn: null,
        image: image(`/u/${key}.png`),
        originalPriceMinor: 3000,
        offerPriceMinor: 2000,
        discountPercent: 33,
        currency: 'SAR',
        ctaLabelAr: null,
        ctaLabelEn: null,
        ctaUrl: null,
        placement: 'HERO',
        isFeatured: false,
        endsAt: null,
        ...overrides,
      }) as PublicProfile['offers'][number];

    const withOffers = profile([item({ code: 'A', image: image('/u/a.png') })]);
    withOffers.offers = [
      offer('LIVE', {}),
      offer('OLD', { endsAt: new Date('2000-01-01T00:00:00Z') }),
      offer('NOPIC', { image: null }),
    ];

    const { slides } = profileToSabah(withOffers);

    expect(slides.map((slide) => slide.id)).toEqual(['offer:LIVE', 'A']);
    expect(slides[0]?.price).toBe(20);
    expect(slides[0]?.tagAr).toContain('33');
  });

  it('passes the published hours through for the browser to evaluate', () => {
    const hours = { timezone: 'Asia/Riyadh', days: { sunday: { closed: false, intervals: [{ opens: '10:00', closes: '23:00' }] } } };
    const withHours = profile([item({})]);
    withHours.contact = { ...withHours.contact, workingHours: hours } as PublicProfile['contact'];

    expect(profileToSabah(withHours).restaurantInfo.workingHours).toEqual(hours);
  });
});

describe('Street Food components', () => {
  it('read restaurant data from the shared context, never from the reference fixture', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const dir = path.join(process.cwd(), 'src/templates/street-food/sabah/components');

    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith('.tsx'))
      .filter((file) =>
        /^import \{[^}]*\} from '\.\.\/data\/menuData'/m.test(readFileSync(path.join(dir, file), 'utf8')),
      );

    expect(offenders).toEqual([]);
  });
});
