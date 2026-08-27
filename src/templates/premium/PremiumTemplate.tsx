import { Calories, Localized, LocaleSwitcher, Price, ProfileImage } from '../shared/primitives';
import { composeProfile } from '../shared/composition';
import { ContactSection, DownloadsSection, OffersSection } from '../shared/sections';
import type { TemplateRenderProps } from '../types';

/**
 * PREMIUM — magazine: a feature spread per category, then a quiet index.
 *
 * Composition identity: each category opens with one item given a full
 * feature treatment — large image, headline, standfirst, price set as a
 * caption — and the rest of the category follows as a compact two-column
 * index beneath it. That asymmetry (one item at 4×, the others at ¼) is
 * unique to this family; every other one treats items uniformly.
 *
 * Where a category has no featured item, the first is promoted, so the
 * composition never collapses into a plain list.
 */
export function PremiumTemplate({ profile, locale, dictionary }: TemplateRenderProps) {
  const composition = composeProfile(profile, locale, dictionary);

  return (
    <article className="premium">
      <header className="premium__masthead">
        <LocaleSwitcher
          locale={locale}
          dictionary={dictionary}
          className="premium__locales"
          itemClassName="premium__locale"
        />
        <Localized
          field={{ ar: profile.nameAr, en: profile.nameEn }}
          locale={locale}
          as="h1"
          className="premium__title"
        />
        <Localized
          field={{ ar: profile.descriptionAr, en: profile.descriptionEn }}
          locale={locale}
          as="p"
          className="premium__standfirst"
        />
      </header>

      <OffersSection
        offers={profile.offers}
        locale={locale}
        dictionary={dictionary}
        prefix="premium"
      />

      <main id="content" className="premium__body">
        {profile.menus.length === 0 ? (
          <p className="premium__empty">{dictionary.profile.menuComingSoon}</p>
        ) : null}

        {profile.menus.map((menu) => (
          <section key={menu.key} data-menu={menu.key}>
            {menu.categories.map((category) => {
              const feature =
                category.items.find((item) => item.isFeatured) ?? category.items[0] ?? null;
              const rest = category.items.filter((item) => item.code !== feature?.code);

              return (
                <section
                  key={category.key}
                  id={`category-${category.key}`}
                  data-category={category.key}
                  className="premium__spread"
                >
                  <Localized
                    field={{ ar: category.nameAr, en: category.nameEn }}
                    locale={locale}
                    as="h2"
                    className="premium__kicker"
                  />

                  {feature ? (
                    <article className="premium__feature" data-item={feature.code}>
                      {feature.image ? (
                        <ProfileImage
                          image={feature.image}
                          locale={locale}
                          className="premium__feature-image"
                          sizes="(min-width: 60rem) 40rem, 100vw"
                        />
                      ) : null}

                      <div className="premium__feature-text">
                        <Localized
                          field={{ ar: feature.nameAr, en: feature.nameEn }}
                          locale={locale}
                          as="h3"
                          className="premium__feature-name"
                        />
                        <Localized
                          field={{ ar: feature.descriptionAr, en: feature.descriptionEn }}
                          locale={locale}
                          as="p"
                          className="premium__feature-standfirst"
                        />
                        <p className="premium__feature-caption">
                          <Price
                            minor={feature.priceMinor}
                            currency={feature.currency}
                            locale={locale}
                            className="premium__feature-price"
                          />
                          <Calories
                            kcal={feature.calories}
                            locale={locale}
                            className="premium__feature-calories"
                          />
                        </p>
                      </div>
                    </article>
                  ) : null}

                  {rest.length > 0 ? (
                    <ul className="premium__index">
                      {rest.map((item) => (
                        <li key={item.code} className="premium__entry" data-item={item.code}>
                          <Localized
                            field={{ ar: item.nameAr, en: item.nameEn }}
                            locale={locale}
                            className="premium__entry-name"
                          />
                          <Localized
                            field={{ ar: item.descriptionAr, en: item.descriptionEn }}
                            locale={locale}
                            as="p"
                            className="premium__entry-note"
                          />
                          <p className="premium__entry-meta">
                            <Price
                              minor={item.priceMinor}
                              currency={item.currency}
                              locale={locale}
                              className="premium__entry-price"
                            />
                            {item.isUnavailable ? (
                              <span className="premium__entry-flag">
                                {dictionary.profile.unavailable}
                              </span>
                            ) : null}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </section>
        ))}
      </main>

      <DownloadsSection
        downloads={profile.downloads}
        locale={locale}
        dictionary={dictionary}
        prefix="premium"
      />

      <ContactSection
        actions={composition.contactActions}
        socials={composition.socialLinks}
        addressAr={profile.contact.addressAr}
        addressEn={profile.contact.addressEn}
        locale={locale}
        dictionary={dictionary}
        prefix="premium"
      />

      {profile.showPlatformFooter ? (
        <p className="premium__platform">{dictionary.profile.poweredBy} Digital Profile OS</p>
      ) : null}
    </article>
  );
}
