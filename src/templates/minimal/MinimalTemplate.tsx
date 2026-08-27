import { Localized, LocaleSwitcher, Price } from '../shared/primitives';
import { composeProfile } from '../shared/composition';
import { ContactSection, DownloadsSection, OffersSection } from '../shared/sections';
import type { TemplateRenderProps } from '../types';
import { designToAttributes } from '@/menu-studio/resolve';

/**
 * MINIMAL — text only, no images, no motion.
 *
 * The deliberate opposite of every other family. It renders no photography at
 * all, even where the business has uploaded some: this is the template for a
 * business whose menu reads better as a list than as a gallery, and for a
 * printed-card sensibility. Categories are plain headings; items are a single
 * line with the price at the inline end; there is no navigation, no
 * disclosure, and no animation whatsoever (§100 — "very little motion").
 *
 * Because it ships no images and no interaction, it is also the fastest page
 * the platform can serve.
 */
export function MinimalTemplate({ profile, locale, dictionary }: TemplateRenderProps) {
  const composition = composeProfile(profile, locale, dictionary);

  return (
    <article className="minimal">
      <header className="minimal__header">
        <Localized
          field={{ ar: profile.nameAr, en: profile.nameEn }}
          locale={locale}
          as="h1"
          className="minimal__title"
        />
        <LocaleSwitcher
          locale={locale}
          dictionary={dictionary}
          className="minimal__locales"
          itemClassName="minimal__locale"
        />
      </header>

      <Localized
        field={{ ar: profile.descriptionAr, en: profile.descriptionEn }}
        locale={locale}
        as="p"
        className="minimal__lede"
      />

      <OffersSection
        offers={profile.offers}
        locale={locale}
        dictionary={dictionary}
        prefix="minimal"
      />

      <main id="content" className="minimal__body">
        {profile.menus.length === 0 ? (
          <p className="minimal__empty">{dictionary.profile.menuComingSoon}</p>
        ) : null}

        {profile.menus.map((menu) => (
          <section key={menu.key} data-menu={menu.key}
            {...designToAttributes(menu.design)} className="minimal__menu">
            {profile.menus.length > 1 ? (
              <Localized
                field={{ ar: menu.titleAr, en: menu.titleEn }}
                locale={locale}
                as="h2"
                className="minimal__menu-title"
              />
            ) : null}

            {menu.categories.map((category) => (
              <section
                key={category.key}
                data-category={category.key}
                className="minimal__category"
              >
                <Localized
                  field={{ ar: category.nameAr, en: category.nameEn }}
                  locale={locale}
                  as="h3"
                  className="minimal__category-title"
                />

                <ul className="minimal__items">
                  {category.items.map((item) => (
                    <li key={item.code} className="minimal__item" data-item={item.code}>
                      <span className="minimal__item-name">
                        <Localized
                          field={{ ar: item.nameAr, en: item.nameEn }}
                          locale={locale}
                        />
                        {item.isUnavailable ? (
                          <span className="minimal__item-flag">
                            {' '}
                            ({dictionary.profile.unavailable})
                          </span>
                        ) : null}
                      </span>
                      <Price
                        minor={item.priceMinor}
                        currency={item.currency}
                        locale={locale}
                        className="minimal__item-price"
                      />
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
        prefix="minimal"
      />

      <ContactSection
        actions={composition.contactActions}
        socials={composition.socialLinks}
        addressAr={profile.contact.addressAr}
        addressEn={profile.contact.addressEn}
        locale={locale}
        dictionary={dictionary}
        prefix="minimal"
      />

      {profile.showPlatformFooter ? (
        <p className="minimal__platform">{dictionary.profile.poweredBy} Digital Profile OS</p>
      ) : null}
    </article>
  );
}
