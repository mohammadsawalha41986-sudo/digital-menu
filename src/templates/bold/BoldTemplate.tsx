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
 * BOLD — full-bleed bands, oversized type, no cards.
 *
 * Composition identity: the page is a stack of edge-to-edge bands rather than
 * a column of content. The business name is set enormous and clipped to the
 * viewport; each category is a band whose heading is a full-width slab; each
 * item is a band with a large image behind an inline caption. Nothing is
 * inset, nothing is a card, and the price is set as large as the item name —
 * the loudest treatment of price in the system.
 */
export function BoldTemplate({ profile, locale, dictionary }: TemplateRenderProps) {
  const composition = composeProfile(profile, locale, dictionary);

  return (
    <article className="bold">
      <header className="bold__hero">
        <LocaleSwitcher
          locale={locale}
          dictionary={dictionary}
          className="bold__locales"
          itemClassName="bold__locale"
        />
        <Localized
          field={{ ar: profile.nameAr, en: profile.nameEn }}
          locale={locale}
          as="h1"
          className="bold__title"
        />
        <Localized
          field={{ ar: profile.descriptionAr, en: profile.descriptionEn }}
          locale={locale}
          as="p"
          className="bold__lede"
        />
        {composition.contactActions.length > 0 ? (
          <div className="bold__hero-actions">
            {composition.contactActions.map((action) => (
              <a
                key={action.key}
                href={action.href}
                className="bold__hero-action"
                data-event={action.event}
                {...(action.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {action.label}
              </a>
            ))}
          </div>
        ) : null}
      </header>

      <HeroOffer

        offer={composition.offers.hero}

        locale={locale}

        dictionary={dictionary}

        prefix="bold"

      />


      <OfferBanners

        offers={composition.offers.banners}

        locale={locale}

        prefix="bold"

      />


      <OffersSection
        offers={composition.offers.section}
        locale={locale}
        dictionary={dictionary}
        prefix="bold"
      />

      <main id="content">
        {profile.menus.length === 0 ? (
          <p className="bold__empty">{dictionary.profile.menuComingSoon}</p>
        ) : null}

        {profile.menus.map((menu) => (
          <section key={menu.key} data-menu={menu.key}
            {...designToAttributes(menu.design)}>
            {menu.categories.map((category) => (
              <section
                key={category.key}
                id={`category-${category.key}`}
                data-category={category.key}
                className="bold__band"
              >
                <h2 className="bold__band-title">
                  <Localized
                    field={{ ar: category.nameAr, en: category.nameEn }}
                    locale={locale}
                  />
                </h2>

                <ul className="bold__items">
                  {category.items.map((item) => (
                    <li key={item.code} className="bold__item" data-item={item.code}>
                      {item.image ? (
                        <ProfileImage
                          image={item.image}
                          locale={locale}
                          className="bold__item-image"
                          sizes="100vw"
                        />
                      ) : null}

                      <div className="bold__item-caption">
                        <Localized
                          field={{ ar: item.nameAr, en: item.nameEn }}
                          locale={locale}
                          as="h3"
                          className="bold__item-name"
                        />
                        <Price
                          minor={item.priceMinor}
                          currency={item.currency}
                          locale={locale}
                          className="bold__item-price"
                        />
                      </div>

                      <Localized
                        field={{ ar: item.descriptionAr, en: item.descriptionEn }}
                        locale={locale}
                        as="p"
                        className="bold__item-description"
                      />

                      <p className="bold__item-meta">
                        <Calories
                          kcal={item.calories}
                          locale={locale}
                          className="bold__item-calories"
                        />
                        {item.isUnavailable ? (
                          <span className="bold__item-flag">{dictionary.profile.unavailable}</span>
                        ) : null}
                      </p>
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
        prefix="bold"
      />

      <HoursSection

        hours={profile.contact.workingHours}

        locale={locale}

        dictionary={dictionary}

        prefix="bold"

      />


      <ContactSection
        actions={composition.contactActions}
        socials={composition.socialLinks}
        addressAr={profile.contact.addressAr}
        addressEn={profile.contact.addressEn}
        locale={locale}
        dictionary={dictionary}
        prefix="bold"
      />

      {profile.showPlatformFooter ? (
        <p className="bold__platform">{dictionary.profile.poweredBy} Digital Profile OS</p>
      ) : null}
    </article>
  );
}
