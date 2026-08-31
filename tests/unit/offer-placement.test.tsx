import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { splitOffersByPlacement } from '@/templates/shared/composition';
import { HeroOffer, OfferBanners, OffersSection } from '@/templates/shared/sections';
import { getDictionary } from '@/i18n/dictionary';
import type { PublicOffer } from '@/server/profile/types';

function offer(key: string, placement: PublicOffer['placement']): PublicOffer {
  return {
    key,
    titleAr: `عرض ${key}`,
    titleEn: `Offer ${key}`,
    descriptionAr: null,
    descriptionEn: null,
    placement,
    image: null,
    originalPriceMinor: 5000,
    offerPriceMinor: 3500,
    currency: 'SAR',
    discountPercent: 30,
    ctaUrl: null,
    ctaLabelAr: null,
    ctaLabelEn: null,
  } as PublicOffer;
}

describe('offer placement — splitting', () => {
  it('routes each placement to its own slot', () => {
    const split = splitOffersByPlacement([
      offer('h', 'HERO'),
      offer('b', 'BANNER'),
      offer('s', 'SECTION'),
    ]);

    expect(split.hero?.key).toBe('h');
    expect(split.banners.map((o) => o.key)).toEqual(['b']);
    expect(split.section.map((o) => o.key)).toEqual(['s']);
  });

  it('keeps only one hero, and rehomes the rest rather than dropping them', () => {
    const split = splitOffersByPlacement([offer('first', 'HERO'), offer('second', 'HERO')]);

    expect(split.hero?.key).toBe('first');
    expect(split.section.map((o) => o.key)).toEqual(['second']);
  });

  it('treats FEATURED as promotion inside the section, not a fourth place', () => {
    const split = splitOffersByPlacement([
      offer('plain', 'SECTION'),
      offer('promoted', 'FEATURED'),
    ]);

    expect(split.hero).toBeNull();
    expect(split.banners).toEqual([]);
    expect(split.section.map((o) => o.key)).toEqual(['promoted', 'plain']);
  });

  it('accepts several banners', () => {
    const split = splitOffersByPlacement([offer('a', 'BANNER'), offer('b', 'BANNER')]);
    expect(split.banners.map((o) => o.key)).toEqual(['a', 'b']);
  });
});

describe('offer placement — rendering', () => {
  const dictionary = getDictionary('en');

  it('gives each placement genuinely different markup', () => {
    const hero = renderToStaticMarkup(
      <HeroOffer offer={offer('h', 'HERO')} locale="en" dictionary={dictionary} prefix="bold" />,
    );
    const banners = renderToStaticMarkup(
      <OfferBanners offers={[offer('b', 'BANNER')]} locale="en" prefix="bold" />,
    );
    const section = renderToStaticMarkup(
      <OffersSection
        offers={[offer('s', 'SECTION')]}
        locale="en"
        dictionary={dictionary}
        prefix="bold"
      />,
    );

    expect(hero).toContain('bold__hero-offer');
    expect(banners).toContain('bold__offer-banners');
    expect(section).toContain('bold__offers');

    // The three must not collapse into the same class, which is what the
    // placement column promised and the templates previously ignored.
    expect(hero).not.toContain('bold__offer-banners');
    expect(hero).not.toContain('bold__offer-list');
    expect(banners).not.toContain('bold__hero-offer');
  });

  it('renders nothing at all for an empty slot', () => {
    expect(
      renderToStaticMarkup(
        <HeroOffer offer={null} locale="en" dictionary={dictionary} prefix="cafe" />,
      ),
    ).toBe('');
    expect(renderToStaticMarkup(<OfferBanners offers={[]} locale="en" prefix="cafe" />)).toBe('');
  });

  it('labels the placement in the markup, so a template can be checked', () => {
    const hero = renderToStaticMarkup(
      <HeroOffer offer={offer('h', 'HERO')} locale="en" dictionary={dictionary} prefix="luxury" />,
    );
    expect(hero).toContain('data-placement="hero"');
  });

  it('carries the discount into the hero as its own element', () => {
    const hero = renderToStaticMarkup(
      <HeroOffer offer={offer('h', 'HERO')} locale="ar" dictionary={getDictionary('ar')} prefix="dark" />,
    );
    expect(hero).toContain('dark__hero-offer-discount');
    expect(hero).toContain('30%');
  });
});
