import { bcp47Of, directionOf } from '@/i18n/config';
import {
  Calories,
  ItemDisclosure,
  LocaleSwitcher,
  Localized,
  Price,
  ProfileImage,
  buildContactActions,
  buildSocialLinks,
  hasContent,
} from '../shared/primitives';
import type { TemplateRenderProps } from '../types';
import { designToAttributes } from '@/menu-studio/resolve';
import { HeroOffer, HoursSection, OfferBanners } from '../shared/sections';
import { splitOffersByPlacement } from '../shared/composition';

/**
 * EDITORIAL — type-led, rule-separated, restrained.
 *
 * Composition identity: a masthead rather than a hero image, a horizontal
 * category index, items as rule-separated rows with the price set as a
 * tabular figure at the inline end, and item detail as an inline disclosure.
 * No card grid anywhere — the rhythm comes from rules and whitespace (§102).
 *
 * Reads only `--brand-*` and `--sys-*`; contains no colour of its own.
 */
export function EditorialTemplate({ profile, locale, dictionary }: TemplateRenderProps) {
  const contactActions = buildContactActions(profile.contact, dictionary);
  const socialLinks = buildSocialLinks(profile.contact);
  const menus = profile.menus;
  const categories = menus.flatMap((menu) => menu.categories);
  const offers = splitOffersByPlacement(profile.offers);

  return (
    <article className="editorial">
      <header className="editorial__masthead">
        <div className="editorial__masthead-top">
          {profile.logo ? (
            <ProfileImage
              image={profile.logo}
              locale={locale}
              className="editorial__logo"
              priority
            />
          ) : null}
          <LocaleSwitcher
            locale={locale}
            dictionary={dictionary}
            className="editorial__locales"
            itemClassName="editorial__locale"
          />
        </div>

        <Localized
          field={{ ar: profile.nameAr, en: profile.nameEn }}
          locale={locale}
          as="h1"
          className="editorial__title"
        />
        <Localized
          field={{ ar: profile.descriptionAr, en: profile.descriptionEn }}
          locale={locale}
          as="p"
          className="editorial__lede"
        />

        {contactActions.length > 0 ? (
          <div className="editorial__actions">
            {contactActions.map((action) => (
              <a
                key={action.key}
                href={action.href}
                className="editorial__action"
                data-event={action.event}
                {...(action.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {action.label}
              </a>
            ))}
          </div>
        ) : null}
      </header>

      <HeroOffer offer={offers.hero} locale={locale} dictionary={dictionary} prefix="editorial" />

      <OfferBanners offers={offers.banners} locale={locale} prefix="editorial" />

      {offers.section.length > 0 ? (
        <section className="editorial__offers" aria-labelledby="offers-heading">
          <h2 id="offers-heading" className="editorial__section-title">
            {dictionary.profile.offers}
          </h2>
          <ul className="editorial__offer-list">
            {offers.section.map((offer) => (
              <li key={offer.key} className="editorial__offer" data-offer={offer.key}>
                <div className="editorial__offer-body">
                  <Localized
                    field={{ ar: offer.titleAr, en: offer.titleEn }}
                    locale={locale}
                    as="h3"
                    className="editorial__offer-title"
                  />
                  <Localized
                    field={{ ar: offer.descriptionAr, en: offer.descriptionEn }}
                    locale={locale}
                    as="p"
                    className="editorial__offer-note"
                  />
                  <p className="editorial__offer-pricing">
                    {offer.originalPriceMinor !== null ? (
                      <s className="editorial__offer-was">
                        <Price
                          minor={offer.originalPriceMinor}
                          currency={offer.currency}
                          locale={locale}
                        />
                      </s>
                    ) : null}
                    <Price
                      minor={offer.offerPriceMinor}
                      currency={offer.currency}
                      locale={locale}
                      className="editorial__offer-now"
                    />
                    {offer.discountPercent !== null ? (
                      <span className="editorial__offer-discount" data-discount="">
                        −{offer.discountPercent}%
                      </span>
                    ) : null}
                  </p>
                  {offer.ctaUrl ? (
                    <a
                      href={offer.ctaUrl}
                      className="editorial__offer-cta"
                      target="_blank"
                      rel="noopener noreferrer"
                      data-event="offer_cta"
                    >
                      <Localized
                        field={{ ar: offer.ctaLabelAr, en: offer.ctaLabelEn }}
                        locale={locale}
                      />
                    </a>
                  ) : null}
                </div>
                {offer.image ? (
                  <ProfileImage
                    image={offer.image}
                    locale={locale}
                    className="editorial__offer-image"
                    sizes="(min-width: 48rem) 20rem, 100vw"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {categories.length > 1 ? (
        <nav aria-label={dictionary.profile.categories} className="editorial__index">
          <ul className="editorial__index-list">
            {categories.map((category) => (
              <li key={category.key}>
                <a href={`#category-${category.key}`} className="editorial__index-link">
                  <Localized
                    field={{ ar: category.nameAr, en: category.nameEn }}
                    locale={locale}
                  />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <main id="content" className="editorial__body">
        {menus.length === 0 ? (
          <p className="editorial__empty">{dictionary.profile.menuComingSoon}</p>
        ) : null}

        {menus.map((menu) => (
          <section key={menu.key} className="editorial__menu" data-menu={menu.key}
            {...designToAttributes(menu.design)}>
            {menus.length > 1 ? (
              <Localized
                field={{ ar: menu.titleAr, en: menu.titleEn }}
                locale={locale}
                as="h2"
                className="editorial__menu-title"
              />
            ) : null}

            {menu.categories.map((category) => (
              <section
                key={category.key}
                id={`category-${category.key}`}
                className="editorial__category"
                data-category={category.key}
              >
                <div className="editorial__category-head">
                  <Localized
                    field={{ ar: category.nameAr, en: category.nameEn }}
                    locale={locale}
                    as="h3"
                    className="editorial__category-title"
                  />
                  <Localized
                    field={{ ar: category.descriptionAr, en: category.descriptionEn }}
                    locale={locale}
                    as="p"
                    className="editorial__category-note"
                  />
                </div>

                <ul className="editorial__items">
                  {category.items.map((item) => (
                    <li key={item.code} className="editorial__item">
                      <ItemDisclosure
                        item={item}
                        locale={locale}
                        dictionary={dictionary}
                        className="editorial__item-disclosure"
                        summary={
                          <span className="editorial__item-row">
                            <span className="editorial__item-heading">
                              <Localized
                                field={{ ar: item.nameAr, en: item.nameEn }}
                                locale={locale}
                                className="editorial__item-name"
                              />
                              {item.isUnavailable ? (
                                <span className="editorial__item-flag">
                                  {dictionary.profile.unavailable}
                                </span>
                              ) : null}
                            </span>
                            <span className="editorial__item-meta">
                              <Calories
                                kcal={item.calories}
                                locale={locale}
                                className="editorial__item-calories"
                              />
                              <Price
                                minor={item.priceMinor}
                                currency={item.currency}
                                locale={locale}
                                className="editorial__item-price"
                              />
                            </span>
                          </span>
                        }
                      >
                        <Localized
                          field={{ ar: item.descriptionAr, en: item.descriptionEn }}
                          locale={locale}
                          as="p"
                          className="editorial__item-description"
                        />
                        {item.image ? (
                          <ProfileImage
                            image={item.image}
                            locale={locale}
                            className="editorial__item-image"
                            sizes="(min-width: 48rem) 32rem, 100vw"
                          />
                        ) : null}
                      </ItemDisclosure>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        ))}
      </main>

      {profile.downloads.length > 0 ? (
        <section className="editorial__downloads" aria-labelledby="downloads-heading">
          <h2 id="downloads-heading" className="editorial__section-title">
            {dictionary.profile.downloads}
          </h2>
          <ul className="editorial__download-list">
            {profile.downloads.map((download) => (
              <li key={download.key} className="editorial__download">
                <a
                  href={download.url}
                  className="editorial__download-link"
                  data-download={download.key}
                  data-event={download.kind === 'link' ? 'external_menu' : 'download_click'}
                  {...(download.kind === 'link'
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  <Localized
                    field={{ ar: download.titleAr, en: download.titleEn }}
                    locale={locale}
                    className="editorial__download-title"
                  />
                  <span className="editorial__download-meta">
                    {download.kind === 'link'
                      ? dictionary.profile.viewFullMenu
                      : download.allowDownload
                        ? dictionary.profile.downloadMenu
                        : dictionary.profile.viewPdfMenu}
                  </span>
                </a>
                <Localized
                  field={{ ar: download.descriptionAr, en: download.descriptionEn }}
                  locale={locale}
                  as="p"
                  className="editorial__download-note"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="editorial__footer">
        {profile.branches.length > 0 ? (
          <section className="editorial__branches">
            <h2 className="editorial__footer-title">{dictionary.profile.branches}</h2>
            <ul className="editorial__branch-list">
              {profile.branches.map((branch) => (
                <li key={branch.key} className="editorial__branch">
                  <Localized
                    field={{ ar: branch.nameAr, en: branch.nameEn }}
                    locale={locale}
                    as="h3"
                    className="editorial__branch-name"
                  />
                  <Localized
                    field={{ ar: branch.addressAr, en: branch.addressEn }}
                    locale={locale}
                    as="p"
                    className="editorial__branch-address"
                  />
                  {branch.googleMapsUrl ? (
                    <a
                      href={branch.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="editorial__branch-link"
                      data-event="contact_maps"
                    >
                      {dictionary.profile.location}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <HoursSection
          hours={profile.contact.workingHours}
          locale={locale}
          dictionary={dictionary}
          prefix="editorial"
        />

        {hasContent(
          { ar: profile.contact.addressAr, en: profile.contact.addressEn },
          locale,
        ) ? (
          <Localized
            field={{ ar: profile.contact.addressAr, en: profile.contact.addressEn }}
            locale={locale}
            as="p"
            className="editorial__address"
          />
        ) : null}

        {socialLinks.length > 0 ? (
          <nav aria-label="Social" className="editorial__social">
            {socialLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="editorial__social-link"
                data-event={link.event}
              >
                {link.label}
              </a>
            ))}
          </nav>
        ) : null}

        {profile.showPlatformFooter ? (
          <p className="editorial__platform" lang={bcp47Of(locale)} dir={directionOf(locale)}>
            {dictionary.profile.poweredBy} Digital Profile OS
          </p>
        ) : null}
      </footer>
    </article>
  );
}
