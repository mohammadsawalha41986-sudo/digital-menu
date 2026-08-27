import { Calories, Localized, LocaleSwitcher, Price, ProfileImage } from '../shared/primitives';
import { composeProfile } from '../shared/composition';
import { ContactSection, DownloadsSection, OffersSection } from '../shared/sections';
import type { TemplateRenderProps } from '../types';
import { designToAttributes } from '@/menu-studio/resolve';

/**
 * DARK — image-forward masonry on a dark ground.
 *
 * Composition identity: the only family whose surface is derived rather than
 * taken from the brand — it darkens the brand background so photography can
 * carry the page. Items are a two-column mosaic of image tiles with the name
 * and price overlaid at the bottom edge; there is no list view at all. A
 * featured item spans both columns.
 *
 * Note on brand tokens: it does not hard-code a dark palette. It composites a
 * translucent scrim over the brand's own text colour, so a business with a
 * light brand still gets a coherent dark treatment (GOALS I6).
 */
export function DarkTemplate({ profile, locale, dictionary }: TemplateRenderProps) {
  const composition = composeProfile(profile, locale, dictionary);

  return (
    <article className="dark">
      <header className="dark__header">
        <div className="dark__header-top">
          {profile.logo ? (
            <ProfileImage image={profile.logo} locale={locale} className="dark__logo" priority />
          ) : null}
          <LocaleSwitcher
            locale={locale}
            dictionary={dictionary}
            className="dark__locales"
            itemClassName="dark__locale"
          />
        </div>

        <Localized
          field={{ ar: profile.nameAr, en: profile.nameEn }}
          locale={locale}
          as="h1"
          className="dark__title"
        />
        <Localized
          field={{ ar: profile.descriptionAr, en: profile.descriptionEn }}
          locale={locale}
          as="p"
          className="dark__lede"
        />
      </header>

      <OffersSection
        offers={profile.offers}
        locale={locale}
        dictionary={dictionary}
        prefix="dark"
      />

      <main id="content" className="dark__body">
        {profile.menus.length === 0 ? (
          <p className="dark__empty">{dictionary.profile.menuComingSoon}</p>
        ) : null}

        {profile.menus.map((menu) => (
          <section key={menu.key} data-menu={menu.key}
            {...designToAttributes(menu.design)}>
            {menu.categories.map((category) => (
              <section
                key={category.key}
                id={`category-${category.key}`}
                data-category={category.key}
                className="dark__category"
              >
                <Localized
                  field={{ ar: category.nameAr, en: category.nameEn }}
                  locale={locale}
                  as="h2"
                  className="dark__category-title"
                />

                <ul className="dark__mosaic">
                  {category.items.map((item) => (
                    <li
                      key={item.code}
                      className="dark__tile"
                      data-item={item.code}
                      data-wide={item.isFeatured ? '' : undefined}
                    >
                      {item.image ? (
                        <ProfileImage
                          image={item.image}
                          locale={locale}
                          className="dark__tile-image"
                          sizes="(min-width: 48rem) 33vw, 50vw"
                        />
                      ) : (
                        <span className="dark__tile-placeholder" aria-hidden="true" />
                      )}

                      <div className="dark__tile-caption">
                        <Localized
                          field={{ ar: item.nameAr, en: item.nameEn }}
                          locale={locale}
                          as="h3"
                          className="dark__tile-name"
                        />
                        <span className="dark__tile-meta">
                          <Price
                            minor={item.priceMinor}
                            currency={item.currency}
                            locale={locale}
                            className="dark__tile-price"
                          />
                          <Calories
                            kcal={item.calories}
                            locale={locale}
                            className="dark__tile-calories"
                          />
                        </span>
                        {item.isUnavailable ? (
                          <span className="dark__tile-flag">{dictionary.profile.unavailable}</span>
                        ) : null}
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
        locale={locale}
        dictionary={dictionary}
        prefix="dark"
      />

      <ContactSection
        actions={composition.contactActions}
        socials={composition.socialLinks}
        addressAr={profile.contact.addressAr}
        addressEn={profile.contact.addressEn}
        locale={locale}
        dictionary={dictionary}
        prefix="dark"
      />

      {profile.showPlatformFooter ? (
        <p className="dark__platform">{dictionary.profile.poweredBy} Digital Profile OS</p>
      ) : null}
    </article>
  );
}
