import {
  Calories,
  ItemDisclosure,
  Localized,
  LocaleSwitcher,
  Price,
  ProfileImage,
} from '../shared/primitives';
import { composeProfile } from '../shared/composition';
import { ContactSection, DownloadsSection, OffersSection } from '../shared/sections';
import type { TemplateRenderProps } from '../types';

/**
 * MODERN — app-like: sticky bar, chip navigation, image-left rows.
 *
 * Composition identity:
 *  - A compact sticky bar carries the logo, name and language switch, so the
 *    business is present the whole way down — the opposite of Luxury's
 *    ceremonial masthead you scroll past once.
 *  - Categories are pill chips in a scroller, the pattern a phone user
 *    already knows from delivery apps.
 *  - Items are horizontal rows: square thumbnail at the inline start, text in
 *    the middle, price at the inline end. Nothing is centred.
 *  - Contact actions are a fixed bottom bar on small screens (§96), which no
 *    other family does.
 */
export function ModernTemplate({ profile, locale, dictionary }: TemplateRenderProps) {
  const composition = composeProfile(profile, locale, dictionary);

  return (
    <article className="modern">
      <header className="modern__bar">
        <div className="modern__identity">
          {profile.logo ? (
            <ProfileImage
              image={profile.logo}
              locale={locale}
              className="modern__logo"
              priority
            />
          ) : null}
          <Localized
            field={{ ar: profile.nameAr, en: profile.nameEn }}
            locale={locale}
            as="h1"
            className="modern__title"
          />
        </div>
        <LocaleSwitcher
          locale={locale}
          dictionary={dictionary}
          className="modern__locales"
          itemClassName="modern__locale"
        />
      </header>

      {composition.categories.length > 0 ? (
        <nav aria-label={dictionary.profile.categories} className="modern__chips">
          {composition.categories.map((category) => (
            <a key={category.key} href={`#category-${category.key}`} className="modern__chip">
              <Localized field={{ ar: category.nameAr, en: category.nameEn }} locale={locale} />
            </a>
          ))}
        </nav>
      ) : null}

      <div className="modern__content">
        <Localized
          field={{ ar: profile.descriptionAr, en: profile.descriptionEn }}
          locale={locale}
          as="p"
          className="modern__lede"
        />

        <OffersSection
          offers={profile.offers}
          locale={locale}
          dictionary={dictionary}
          prefix="modern"
        />

        <main id="content" className="modern__body">
          {profile.menus.length === 0 ? (
            <p className="modern__empty">{dictionary.profile.menuComingSoon}</p>
          ) : null}

          {profile.menus.map((menu) => (
            <section key={menu.key} data-menu={menu.key}>
              {profile.menus.length > 1 ? (
                <Localized
                  field={{ ar: menu.titleAr, en: menu.titleEn }}
                  locale={locale}
                  as="h2"
                  className="modern__menu-title"
                />
              ) : null}

              {menu.categories.map((category) => (
                <section
                  key={category.key}
                  id={`category-${category.key}`}
                  data-category={category.key}
                  className="modern__category"
                >
                  <Localized
                    field={{ ar: category.nameAr, en: category.nameEn }}
                    locale={locale}
                    as="h3"
                    className="modern__category-title"
                  />

                  <ul className="modern__items">
                    {category.items.map((item) => (
                      <li key={item.code} className="modern__item">
                        <ItemDisclosure
                          item={item}
                          locale={locale}
                          dictionary={dictionary}
                          className="modern__item-disclosure"
                          summary={
                            <span className="modern__row">
                              {item.image ? (
                                <ProfileImage
                                  image={item.image}
                                  locale={locale}
                                  className="modern__thumb"
                                  sizes="88px"
                                />
                              ) : (
                                <span className="modern__thumb modern__thumb--empty" aria-hidden="true" />
                              )}

                              <span className="modern__row-text">
                                <Localized
                                  field={{ ar: item.nameAr, en: item.nameEn }}
                                  locale={locale}
                                  className="modern__item-name"
                                />
                                <Localized
                                  field={{ ar: item.descriptionAr, en: item.descriptionEn }}
                                  locale={locale}
                                  className="modern__item-summary"
                                />
                                <span className="modern__item-meta">
                                  <Calories
                                    kcal={item.calories}
                                    locale={locale}
                                    className="modern__item-calories"
                                  />
                                  {item.isUnavailable ? (
                                    <span className="modern__item-flag">
                                      {dictionary.profile.unavailable}
                                    </span>
                                  ) : null}
                                </span>
                              </span>

                              <Price
                                minor={item.priceMinor}
                                currency={item.currency}
                                locale={locale}
                                className="modern__item-price"
                              />
                            </span>
                          }
                        >
                          <Localized
                            field={{ ar: item.descriptionAr, en: item.descriptionEn }}
                            locale={locale}
                            as="p"
                            className="modern__item-description"
                          />
                        </ItemDisclosure>
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
          prefix="modern"
        />

        <ContactSection
          actions={composition.contactActions}
          socials={composition.socialLinks}
          addressAr={profile.contact.addressAr}
          addressEn={profile.contact.addressEn}
          locale={locale}
          dictionary={dictionary}
          prefix="modern"
        />

        {profile.showPlatformFooter ? (
          <p className="modern__platform">{dictionary.profile.poweredBy} Digital Profile OS</p>
        ) : null}
      </div>

      {composition.contactActions.length > 0 ? (
        <nav className="modern__dock" aria-label={dictionary.profile.contact}>
          {composition.contactActions.map((action) => (
            <a
              key={action.key}
              href={action.href}
              className="modern__dock-action"
              data-event={action.event}
              {...(action.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {action.label}
            </a>
          ))}
        </nav>
      ) : null}
    </article>
  );
}
