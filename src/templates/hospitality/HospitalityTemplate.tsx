import { Localized, LocaleSwitcher, Price, hasContent } from '../shared/primitives';
import { composeProfile } from '../shared/composition';
import { ContactSection, DownloadsSection, OffersSection } from '../shared/sections';
import type { TemplateRenderProps } from '../types';
import { designToAttributes } from '@/menu-studio/resolve';

/**
 * HOSPITALITY — a service catalogue, not a food menu.
 *
 * Built for salons, spas, barbers, gyms and hotels, where the questions are
 * "what do you offer, how long does it take, what does it cost, how do I
 * book" (master spec §16, §94). Composition identity:
 *  - A details block leads the page: address and opening hours *above* the
 *    catalogue, because a service business is chosen partly on location.
 *  - Categories are collapsible groups, open by default, so a long service
 *    list can be scanned by section on a phone.
 *  - Each service is a row of name / serving-size-as-duration / price.
 *  - Booking or contact is repeated after every group, since the decision to
 *    book happens while reading a service, not at the end of the page.
 */
export function HospitalityTemplate({ profile, locale, dictionary }: TemplateRenderProps) {
  const composition = composeProfile(profile, locale, dictionary);
  const primaryAction = composition.contactActions[0];

  // The details block is this family's opening move, but an empty one is a
  // broken card — the spec's words (§120). Render it only when there is
  // something to put in it.
  const hasDetails =
    composition.contactActions.length > 0 ||
    hasContent({ ar: profile.contact.addressAr, en: profile.contact.addressEn }, locale);

  return (
    <article className="hospitality">
      <header className="hospitality__header">
        <LocaleSwitcher
          locale={locale}
          dictionary={dictionary}
          className="hospitality__locales"
          itemClassName="hospitality__locale"
        />
        <Localized
          field={{ ar: profile.nameAr, en: profile.nameEn }}
          locale={locale}
          as="h1"
          className="hospitality__title"
        />
        <Localized
          field={{ ar: profile.descriptionAr, en: profile.descriptionEn }}
          locale={locale}
          as="p"
          className="hospitality__lede"
        />
      </header>

      {hasDetails ? (
        <section className="hospitality__details" aria-label={dictionary.profile.about}>
          <Localized
            field={{ ar: profile.contact.addressAr, en: profile.contact.addressEn }}
            locale={locale}
            as="p"
            className="hospitality__address"
          />
          {composition.contactActions.length > 0 ? (
            <div className="hospitality__actions">
              {composition.contactActions.map((action) => (
                <a
                  key={action.key}
                  href={action.href}
                  className="hospitality__action"
                  data-event={action.event}
                  {...(action.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {action.label}
                </a>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <OffersSection
        offers={profile.offers}
        locale={locale}
        dictionary={dictionary}
        prefix="hospitality"
      />

      <main id="content" className="hospitality__body">
        {profile.menus.length === 0 ? (
          <p className="hospitality__empty">{dictionary.profile.menuComingSoon}</p>
        ) : null}

        {profile.menus.map((menu) => (
          <section key={menu.key} data-menu={menu.key}
            {...designToAttributes(menu.design)}>
            {menu.categories.map((category) => (
              <details
                key={category.key}
                id={`category-${category.key}`}
                data-category={category.key}
                className="hospitality__group"
                open
              >
                <summary className="hospitality__group-summary">
                  <Localized
                    field={{ ar: category.nameAr, en: category.nameEn }}
                    locale={locale}
                    className="hospitality__group-title"
                  />
                  <span className="hospitality__group-count">{category.items.length}</span>
                </summary>

                <ul className="hospitality__services">
                  {category.items.map((item) => (
                    <li key={item.code} className="hospitality__service" data-item={item.code}>
                      <div className="hospitality__service-main">
                        <Localized
                          field={{ ar: item.nameAr, en: item.nameEn }}
                          locale={locale}
                          as="h3"
                          className="hospitality__service-name"
                        />
                        <Localized
                          field={{ ar: item.descriptionAr, en: item.descriptionEn }}
                          locale={locale}
                          as="p"
                          className="hospitality__service-note"
                        />
                      </div>

                      <div className="hospitality__service-meta">
                        {/* Serving size doubles as duration for a service business. */}
                        <Localized
                          field={{ ar: item.servingSizeAr, en: item.servingSizeEn }}
                          locale={locale}
                          className="hospitality__service-duration"
                        />
                        <Price
                          minor={item.priceMinor}
                          currency={item.currency}
                          locale={locale}
                          className="hospitality__service-price"
                        />
                        {item.isUnavailable ? (
                          <span className="hospitality__service-flag">
                            {dictionary.profile.unavailable}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>

                {primaryAction ? (
                  <a
                    href={primaryAction.href}
                    className="hospitality__group-cta"
                    data-event={primaryAction.event}
                    {...(primaryAction.external
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    {primaryAction.label}
                  </a>
                ) : null}
              </details>
            ))}
          </section>
        ))}
      </main>

      <DownloadsSection
        downloads={profile.downloads}
        locale={locale}
        dictionary={dictionary}
        prefix="hospitality"
      />

      <ContactSection
        actions={composition.contactActions}
        socials={composition.socialLinks}
        addressAr={profile.contact.addressAr}
        addressEn={profile.contact.addressEn}
        locale={locale}
        dictionary={dictionary}
        prefix="hospitality"
      />

      {profile.showPlatformFooter ? (
        <p className="hospitality__platform">
          {dictionary.profile.poweredBy} Digital Profile OS
        </p>
      ) : null}
    </article>
  );
}
