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
 * CAFÉ — compact tiles, underlined tabs, light movement.
 *
 * Composition identity: a two-up grid of small square tiles, sized for a
 * drinks list where twenty items is normal and each needs only a name, a size
 * and a price. Categories are underlined tabs rather than pills or a rule
 * index. Motion is the lightest playful touch in the system — a small lift on
 * press — and nothing else (§100).
 */
export function CafeTemplate({ profile, locale, dictionary }: TemplateRenderProps) {
  const composition = composeProfile(profile, locale, dictionary);

  return (
    <article className="cafe">
      <header className="cafe__header">
        {profile.logo ? (
          <ProfileImage image={profile.logo} locale={locale} className="cafe__logo" priority />
        ) : null}
        <Localized
          field={{ ar: profile.nameAr, en: profile.nameEn }}
          locale={locale}
          as="h1"
          className="cafe__title"
        />
        <Localized
          field={{ ar: profile.descriptionAr, en: profile.descriptionEn }}
          locale={locale}
          as="p"
          className="cafe__lede"
        />
        <LocaleSwitcher
          locale={locale}
          dictionary={dictionary}
          className="cafe__locales"
          itemClassName="cafe__locale"
        />
      </header>

      {composition.categories.length > 1 ? (
        <nav aria-label={dictionary.profile.categories} className="cafe__tabs">
          {composition.categories.map((category) => (
            <a key={category.key} href={`#category-${category.key}`} className="cafe__tab">
              <Localized field={{ ar: category.nameAr, en: category.nameEn }} locale={locale} />
            </a>
          ))}
        </nav>
      ) : null}

      <HeroOffer

        offer={composition.offers.hero}

        locale={locale}

        dictionary={dictionary}

        prefix="cafe"

      />


      <OfferBanners

        offers={composition.offers.banners}

        locale={locale}

        prefix="cafe"

      />


      <OffersSection
        offers={composition.offers.section}
        locale={locale}
        dictionary={dictionary}
        prefix="cafe"
      />

      <main id="content" className="cafe__body">
        {profile.menus.length === 0 ? (
          <p className="cafe__empty">{dictionary.profile.menuComingSoon}</p>
        ) : null}

        {profile.menus.map((menu) => (
          <section key={menu.key} data-menu={menu.key}
            {...designToAttributes(menu.design)}>
            {menu.categories.map((category) => (
              <section
                key={category.key}
                id={`category-${category.key}`}
                data-category={category.key}
                className="cafe__category"
              >
                <Localized
                  field={{ ar: category.nameAr, en: category.nameEn }}
                  locale={locale}
                  as="h2"
                  className="cafe__category-title"
                />

                <ul className="cafe__grid">
                  {category.items.map((item) => (
                    <li key={item.code} className="cafe__tile" data-item={item.code}>
                      {item.image ? (
                        <ProfileImage
                          image={item.image}
                          locale={locale}
                          className="cafe__tile-image"
                          sizes="(min-width: 48rem) 20vw, 45vw"
                        />
                      ) : null}

                      <Localized
                        field={{ ar: item.nameAr, en: item.nameEn }}
                        locale={locale}
                        as="h3"
                        className="cafe__tile-name"
                      />

                      <Localized
                        field={{ ar: item.servingSizeAr, en: item.servingSizeEn }}
                        locale={locale}
                        className="cafe__tile-size"
                      />

                      <p className="cafe__tile-meta">
                        <Price
                          minor={item.priceMinor}
                          currency={item.currency}
                          locale={locale}
                          className="cafe__tile-price"
                        />
                        <Calories
                          kcal={item.calories}
                          locale={locale}
                          className="cafe__tile-calories"
                        />
                      </p>

                      {item.isUnavailable ? (
                        <span className="cafe__tile-flag">{dictionary.profile.unavailable}</span>
                      ) : null}
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
        locale={locale}
        dictionary={dictionary}
        prefix="cafe"
      />

      <HoursSection

        hours={profile.contact.workingHours}

        locale={locale}

        dictionary={dictionary}

        prefix="cafe"

      />


      <ContactSection
        actions={composition.contactActions}
        socials={composition.socialLinks}
        addressAr={profile.contact.addressAr}
        addressEn={profile.contact.addressEn}
        locale={locale}
        dictionary={dictionary}
        prefix="cafe"
      />

      {profile.showPlatformFooter ? (
        <p className="cafe__platform">{dictionary.profile.poweredBy} Digital Profile OS</p>
      ) : null}
    </article>
  );
}
