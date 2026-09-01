import { Calories, Localized, LocaleSwitcher, Price, ProfileImage } from '../shared/primitives';
import { composeProfile } from '../shared/composition';
import {
  ContactSection,
  DownloadsSection,
  HeroOffer,
  HoursSection,
  OfferBanners,
  OffersSection,
} from '../shared/sections';
import type { TemplateRenderProps } from '../types';
import { designToAttributes } from '@/menu-studio/resolve';

/**
 * LUXURY — centred, ceremonial, image-restrained.
 *
 * Composition identity, and how it differs from every other family:
 *  - The masthead is centred and symmetrical, with the logo above the name and
 *    a rule beneath — a plate, not a header bar.
 *  - Categories get no navigation at all. A fine-dining menu is read top to
 *    bottom; a chip bar would be a supermarket gesture.
 *  - Items are centred stanzas: name, then description, then price on its own
 *    line. No leader dots, no columns — the whitespace does the alignment.
 *  - Item images appear only for featured dishes, at most one per category.
 *  - Motion is slow and additive: long fades, nothing that slides.
 */
export function LuxuryTemplate({ profile, locale, dictionary }: TemplateRenderProps) {
  const composition = composeProfile(profile, locale, dictionary);

  return (
    <article className="luxury">
      <header className="luxury__masthead">
        <LocaleSwitcher
          locale={locale}
          dictionary={dictionary}
          className="luxury__locales"
          itemClassName="luxury__locale"
        />

        {profile.logo ? (
          <ProfileImage
            image={profile.logo}
            locale={locale}
            className="luxury__logo"
            priority
          />
        ) : null}

        <Localized
          field={{ ar: profile.nameAr, en: profile.nameEn }}
          locale={locale}
          as="h1"
          className="luxury__title"
        />

        <span className="luxury__rule" aria-hidden="true" />

        <Localized
          field={{ ar: profile.descriptionAr, en: profile.descriptionEn }}
          locale={locale}
          as="p"
          className="luxury__lede"
        />
      </header>

      <HeroOffer

        offer={composition.offers.hero}

        locale={locale}

        dictionary={dictionary}

        prefix="luxury"

      />


      <OfferBanners

        offers={composition.offers.banners}

        locale={locale}

        prefix="luxury"

      />


      <OffersSection
        offers={composition.offers.section}
        locale={locale}
        dictionary={dictionary}
        prefix="luxury"
      />

      <main id="content" className="luxury__body">
        {profile.menus.length === 0 ? (
          <p className="luxury__empty">{dictionary.profile.menuComingSoon}</p>
        ) : null}

        {profile.menus.map((menu) => (
          <section key={menu.key} className="luxury__menu" data-menu={menu.key}
            {...designToAttributes(menu.design)}>
            {profile.menus.length > 1 ? (
              <Localized
                field={{ ar: menu.titleAr, en: menu.titleEn }}
                locale={locale}
                as="h2"
                className="luxury__menu-title"
              />
            ) : null}

            {menu.categories.map((category) => {
              // At most one image per category: on a luxury menu a photograph
              // is punctuation, not the substance.
              const feature = category.items.find((item) => item.isFeatured && item.image);

              return (
                <section
                  key={category.key}
                  id={`category-${category.key}`}
                  className="luxury__category"
                  data-category={category.key}
                >
                  <Localized
                    field={{ ar: category.nameAr, en: category.nameEn }}
                    locale={locale}
                    as="h3"
                    className="luxury__category-title"
                  />
                  <Localized
                    field={{ ar: category.descriptionAr, en: category.descriptionEn }}
                    locale={locale}
                    as="p"
                    className="luxury__category-note"
                  />

                  {feature?.image ? (
                    <ProfileImage
                      image={feature.image}
                      locale={locale}
                      className="luxury__feature-image"
                      sizes="(min-width: 48rem) 40rem, 100vw"
                    />
                  ) : null}

                  <ul className="luxury__items">
                    {category.items.map((item) => (
                      <li key={item.code} className="luxury__item" data-item={item.code}>
                        <Localized
                          field={{ ar: item.nameAr, en: item.nameEn }}
                          locale={locale}
                          as="h4"
                          className="luxury__item-name"
                        />
                        <Localized
                          field={{ ar: item.descriptionAr, en: item.descriptionEn }}
                          locale={locale}
                          as="p"
                          className="luxury__item-description"
                        />
                        <p className="luxury__item-meta">
                          <Price
                            minor={item.priceMinor}
                            currency={item.currency}
                            locale={locale}
                            className="luxury__item-price"
                          />
                          <Calories
                            kcal={item.calories}
                            locale={locale}
                            className="luxury__item-calories"
                          />
                          {item.isUnavailable ? (
                            <span className="luxury__item-flag">
                              {dictionary.profile.unavailable}
                            </span>
                          ) : null}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </section>
        ))}
      </main>

      <DownloadsSection
        downloads={profile.downloads}
        printHref={`/m/${profile.publicId}/print`}
        locale={locale}
        dictionary={dictionary}
        prefix="luxury"
      />

      <HoursSection

        hours={profile.contact.workingHours}

        locale={locale}

        dictionary={dictionary}

        prefix="luxury"

      />


      <ContactSection
        actions={composition.contactActions}
        socials={composition.socialLinks}
        addressAr={profile.contact.addressAr}
        addressEn={profile.contact.addressEn}
        locale={locale}
        dictionary={dictionary}
        prefix="luxury"
      />

      {profile.showPlatformFooter ? (
        <p className="luxury__platform">{dictionary.profile.poweredBy} Digital Profile OS</p>
      ) : null}
    </article>
  );
}
