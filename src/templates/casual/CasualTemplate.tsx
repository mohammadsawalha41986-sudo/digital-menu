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
 * CASUAL — category tiles first, then a plain photo list.
 *
 * Composition identity: the page opens with a grid of large category tiles —
 * a picture and a name each — so a family choosing at the table starts by
 * picking a section rather than scrolling a long list. Below that, each
 * category is a straightforward list of photo-left rows with generous type.
 * No sticky chrome, no disclosure, nothing to learn.
 */
export function CasualTemplate({ profile, locale, dictionary }: TemplateRenderProps) {
  const composition = composeProfile(profile, locale, dictionary);

  return (
    <article className="casual">
      <header className="casual__header">
        <div className="casual__header-top">
          {profile.logo ? (
            <ProfileImage image={profile.logo} locale={locale} className="casual__logo" priority />
          ) : null}
          <LocaleSwitcher
            locale={locale}
            dictionary={dictionary}
            className="casual__locales"
            itemClassName="casual__locale"
          />
        </div>
        <Localized
          field={{ ar: profile.nameAr, en: profile.nameEn }}
          locale={locale}
          as="h1"
          className="casual__title"
        />
        <Localized
          field={{ ar: profile.descriptionAr, en: profile.descriptionEn }}
          locale={locale}
          as="p"
          className="casual__lede"
        />
      </header>

      {composition.categories.length > 1 ? (
        <nav aria-label={dictionary.profile.categories} className="casual__picker">
          {composition.categories.map((category) => (
            <a
              key={category.key}
              href={`#category-${category.key}`}
              className="casual__picker-tile"
            >
              {category.image ? (
                <ProfileImage
                  image={category.image}
                  locale={locale}
                  className="casual__picker-image"
                  sizes="(min-width: 48rem) 25vw, 45vw"
                />
              ) : (
                <span className="casual__picker-placeholder" aria-hidden="true" />
              )}
              <span className="casual__picker-label">
                <Localized field={{ ar: category.nameAr, en: category.nameEn }} locale={locale} />
              </span>
            </a>
          ))}
        </nav>
      ) : null}

      <HeroOffer

        offer={composition.offers.hero}

        locale={locale}

        dictionary={dictionary}

        prefix="casual"

      />


      <OfferBanners

        offers={composition.offers.banners}

        locale={locale}

        prefix="casual"

      />


      <OffersSection
        offers={composition.offers.section}
        locale={locale}
        dictionary={dictionary}
        prefix="casual"
      />

      <main id="content" className="casual__body">
        {profile.menus.length === 0 ? (
          <p className="casual__empty">{dictionary.profile.menuComingSoon}</p>
        ) : null}

        {profile.menus.map((menu) => (
          <section key={menu.key} data-menu={menu.key}
            {...designToAttributes(menu.design)}>
            {menu.categories.map((category) => (
              <section
                key={category.key}
                id={`category-${category.key}`}
                data-category={category.key}
                className="casual__category"
              >
                <Localized
                  field={{ ar: category.nameAr, en: category.nameEn }}
                  locale={locale}
                  as="h2"
                  className="casual__category-title"
                />

                <ul className="casual__items">
                  {category.items.map((item) => (
                    <li key={item.code} className="casual__item" data-item={item.code}>
                      {item.image ? (
                        <ProfileImage
                          image={item.image}
                          locale={locale}
                          className="casual__item-image"
                          sizes="(min-width: 48rem) 12rem, 30vw"
                        />
                      ) : null}

                      <div className="casual__item-text">
                        <Localized
                          field={{ ar: item.nameAr, en: item.nameEn }}
                          locale={locale}
                          as="h3"
                          className="casual__item-name"
                        />
                        <Localized
                          field={{ ar: item.descriptionAr, en: item.descriptionEn }}
                          locale={locale}
                          as="p"
                          className="casual__item-description"
                        />
                        <p className="casual__item-meta">
                          <Price
                            minor={item.priceMinor}
                            currency={item.currency}
                            locale={locale}
                            className="casual__item-price"
                          />
                          <Calories
                            kcal={item.calories}
                            locale={locale}
                            className="casual__item-calories"
                          />
                          {item.isUnavailable ? (
                            <span className="casual__item-flag">
                              {dictionary.profile.unavailable}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        ))}
      </main>

      <DownloadsSection
        downloads={profile.downloads}
        printHref={`/m/${profile.publicId}/print`}
        locale={locale}
        dictionary={dictionary}
        prefix="casual"
      />

      <HoursSection

        hours={profile.contact.workingHours}

        locale={locale}

        dictionary={dictionary}

        prefix="casual"

      />


      <ContactSection
        actions={composition.contactActions}
        socials={composition.socialLinks}
        addressAr={profile.contact.addressAr}
        addressEn={profile.contact.addressEn}
        locale={locale}
        dictionary={dictionary}
        prefix="casual"
      />

      {profile.showPlatformFooter ? (
        <p className="casual__platform">{dictionary.profile.poweredBy} Digital Profile OS</p>
      ) : null}
    </article>
  );
}
