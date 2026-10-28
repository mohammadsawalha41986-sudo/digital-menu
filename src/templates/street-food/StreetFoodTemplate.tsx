import {
  Calories,
  ItemDisclosure,
  Localized,
  LocaleSwitcher,
  Price,
  ProfileImage,
} from '../shared/primitives';
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
 * STREET FOOD — delivery-app composition, phone-first, big food photography.
 *
 * Composition identity:
 *  - A full-bleed hero card leads the page with the business name, pitch and
 *    a primary CTA pointing at the menu. No other family centres a photo-led
 *    hero at the top: Editorial opens with a masthead, Modern a thin sticky
 *    bar, Luxury a ceremonial centred title.
 *  - Categories are a horizontally snap-scrolling chip rail — the ONLY
 *    navigation. There is no sticky index or secondary bar; the chip rail
 *    sticks under the identity bar and travels with the reader.
 *  - Items are vertical photo cards in a 2-column phone grid stepping up to
 *    4-column on wide screens. The price sits as a badge on the card, not
 *    aligned to a column rule. The opposite composition from Modern's
 *    horizontal rows.
 *  - Contact actions are a fixed bottom dock on phones; WhatsApp is the
 *    only one promoted (coloured with the brand's primary).
 *
 * This template receives content and locale only. Colours arrive via the
 * `--brand-*` custom properties on an ancestor element (master spec §22–§26),
 * so the family serves any restaurant without carrying brand of its own.
 */
export function StreetFoodTemplate({ profile, locale, dictionary }: TemplateRenderProps) {
  const composition = composeProfile(profile, locale, dictionary);
  const firstMenuKey = profile.menus[0]?.key;
  const menuAnchor = firstMenuKey ? `#menu-${firstMenuKey}` : '#content';
  const hasFeatured = composition.featured.length > 0;

  return (
    <article className="street-food">
      <header className="street-food__bar">
        <div className="street-food__identity">
          {profile.logo ? (
            <ProfileImage
              image={profile.logo}
              locale={locale}
              className="street-food__logo"
              priority
            />
          ) : null}
          <Localized
            field={{ ar: profile.nameAr, en: profile.nameEn }}
            locale={locale}
            as="h1"
            className="street-food__title"
          />
        </div>
        <LocaleSwitcher
          locale={locale}
          dictionary={dictionary}
          className="street-food__locales"
          itemClassName="street-food__locale"
        />
      </header>

      <section className="street-food__hero">
        <div className="street-food__hero-copy">
          <Localized
            field={{ ar: profile.nameAr, en: profile.nameEn }}
            locale={locale}
            as="p"
            className="street-food__hero-eyebrow"
          />
          <Localized
            field={{ ar: profile.descriptionAr, en: profile.descriptionEn }}
            locale={locale}
            as="h2"
            className="street-food__hero-headline"
          />
          <a href={menuAnchor} className="street-food__hero-cta">
            {dictionary.profile.categories}
          </a>
        </div>
        {profile.logo ? (
          <ProfileImage
            image={profile.logo}
            locale={locale}
            className="street-food__hero-image"
            sizes="(min-width: 960px) 320px, 44vw"
          />
        ) : (
          <div
            className="street-food__hero-image street-food__hero-image--empty"
            aria-hidden="true"
          />
        )}
      </section>

      <HeroOffer
        offer={composition.offers.hero}
        locale={locale}
        dictionary={dictionary}
        prefix="street-food"
      />

      <OfferBanners
        offers={composition.offers.banners}
        locale={locale}
        prefix="street-food"
      />

      {composition.categories.length > 0 ? (
        <nav aria-label={dictionary.profile.categories} className="street-food__chips">
          <ul className="street-food__chips-rail">
            {composition.categories.map((category) => (
              <li key={category.key} className="street-food__chip-item">
                <a href={`#category-${category.key}`} className="street-food__chip">
                  {category.image ? (
                    <ProfileImage
                      image={category.image}
                      locale={locale}
                      className="street-food__chip-image"
                      sizes="56px"
                    />
                  ) : (
                    <span
                      className="street-food__chip-image street-food__chip-image--empty"
                      aria-hidden="true"
                    />
                  )}
                  <Localized
                    field={{ ar: category.nameAr, en: category.nameEn }}
                    locale={locale}
                    className="street-food__chip-label"
                  />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <main id="content" className="street-food__body">
        {hasFeatured ? (
          <section
            aria-label={dictionary.profile.categories}
            className="street-food__featured"
          >
            <ul className="street-food__featured-rail">
              {composition.featured.slice(0, 8).map((item) => (
                <li key={item.code} className="street-food__featured-item">
                  <span className="street-food__featured-media">
                    {item.image ? (
                      <ProfileImage
                        image={item.image}
                        locale={locale}
                        className="street-food__featured-image"
                        sizes="220px"
                      />
                    ) : (
                      <span
                        className="street-food__featured-image street-food__featured-image--empty"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="street-food__featured-body">
                    <Localized
                      field={{ ar: item.nameAr, en: item.nameEn }}
                      locale={locale}
                      className="street-food__featured-name"
                    />
                    <Price
                      minor={item.priceMinor}
                      currency={item.currency}
                      locale={locale}
                      className="street-food__featured-price"
                    />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <OffersSection
          offers={composition.offers.section}
          locale={locale}
          dictionary={dictionary}
          prefix="street-food"
        />

        {profile.menus.length === 0 ? (
          <p className="street-food__empty">{dictionary.profile.menuComingSoon}</p>
        ) : null}

        {profile.menus.map((menu) => (
          <section
            key={menu.key}
            id={`menu-${menu.key}`}
            data-menu={menu.key}
            {...designToAttributes(menu.design)}
            className="street-food__menu"
          >
            {profile.menus.length > 1 ? (
              <Localized
                field={{ ar: menu.titleAr, en: menu.titleEn }}
                locale={locale}
                as="h2"
                className="street-food__menu-title"
              />
            ) : null}

            {menu.categories.map((category) => (
              <section
                key={category.key}
                id={`category-${category.key}`}
                data-category={category.key}
                className="street-food__category"
              >
                <div className="street-food__category-head">
                  <Localized
                    field={{ ar: category.nameAr, en: category.nameEn }}
                    locale={locale}
                    as="h3"
                    className="street-food__category-title"
                  />
                  <Localized
                    field={{ ar: category.descriptionAr, en: category.descriptionEn }}
                    locale={locale}
                    as="p"
                    className="street-food__category-lede"
                  />
                </div>

                <ul className="street-food__grid">
                  {category.items.map((item) => (
                    <li
                      key={item.code}
                      className="street-food__card"
                      data-item=""
                      data-item-code={item.code}
                      data-item-name-ar={item.nameAr}
                      data-item-name-en={item.nameEn ?? item.nameAr}
                      data-item-price={item.priceMinor !== null ? String(item.priceMinor) : undefined}
                      data-item-currency={item.currency}
                      data-item-image={item.image?.url ?? undefined}
                      data-unavailable={item.isUnavailable || undefined}
                    >
                      <ItemDisclosure
                        item={item}
                        locale={locale}
                        dictionary={dictionary}
                        className="street-food__card-disclosure"
                        summary={
                          <span className="street-food__card-face">
                            <span className="street-food__card-media">
                              {item.image ? (
                                <ProfileImage
                                  image={item.image}
                                  locale={locale}
                                  className="street-food__card-image"
                                  sizes="(min-width: 1200px) 240px, (min-width: 720px) 30vw, 44vw"
                                />
                              ) : (
                                <span
                                  className="street-food__card-image street-food__card-image--empty"
                                  aria-hidden="true"
                                />
                              )}
                              {item.calories !== null ? (
                                <span className="street-food__card-kcal">
                                  <Calories kcal={item.calories} locale={locale} />
                                </span>
                              ) : null}
                              {item.isUnavailable ? (
                                <span className="street-food__card-flag">
                                  {dictionary.profile.unavailable}
                                </span>
                              ) : null}
                            </span>
                            <span className="street-food__card-body">
                              <Localized
                                field={{ ar: item.nameAr, en: item.nameEn }}
                                locale={locale}
                                as="span"
                                className="street-food__card-name"
                              />
                              <Localized
                                field={{ ar: item.descriptionAr, en: item.descriptionEn }}
                                locale={locale}
                                as="span"
                                className="street-food__card-summary"
                              />
                              <Price
                                minor={item.priceMinor}
                                currency={item.currency}
                                locale={locale}
                                className="street-food__card-price"
                              />
                            </span>
                          </span>
                        }
                      >
                        <Localized
                          field={{ ar: item.descriptionAr, en: item.descriptionEn }}
                          locale={locale}
                          as="p"
                          className="street-food__card-description"
                        />
                      </ItemDisclosure>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        ))}

        <DownloadsSection
          downloads={profile.downloads}
          printHref={`/m/${profile.publicId}/print`}
          locale={locale}
          dictionary={dictionary}
          prefix="street-food"
        />

        <HoursSection
          hours={profile.contact.workingHours}
          locale={locale}
          dictionary={dictionary}
          prefix="street-food"
        />

        <ContactSection
          actions={composition.contactActions}
          socials={composition.socialLinks}
          addressAr={profile.contact.addressAr}
          addressEn={profile.contact.addressEn}
          locale={locale}
          dictionary={dictionary}
          prefix="street-food"
        />

        {profile.showPlatformFooter ? (
          <p className="street-food__platform">
            {dictionary.profile.poweredBy} Digital Profile OS
          </p>
        ) : null}
      </main>

      {composition.contactActions.length > 0 ? (
        <nav className="street-food__dock" aria-label={dictionary.profile.contact}>
          {composition.contactActions.map((action) => (
            <a
              key={action.key}
              href={action.href}
              className="street-food__dock-action"
              data-event={action.event}
              data-key={action.key}
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
