import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/dictionary';
import type { PublicDownload, PublicOffer } from '@/server/profile/types';
import { Localized, Price, ProfileImage } from './primitives';

/**
 * Section renderers that carry meaning rather than appearance.
 *
 * Each takes a class-name prefix, so a template's own stylesheet decides
 * entirely how the section looks — a downloads list can be a plain list in one
 * family and a row of cards in another, from the same markup. What is shared
 * is the *semantics*: correct language tagging, the file-versus-link
 * distinction, computed discounts, and the analytics hooks.
 */

export function OffersSection({
  offers,
  locale,
  dictionary,
  prefix,
  heading = true,
}: {
  offers: PublicOffer[];
  locale: Locale;
  dictionary: Dictionary;
  prefix: string;
  heading?: boolean;
}) {
  if (offers.length === 0) return null;

  return (
    <section className={`${prefix}__offers`} aria-labelledby={`${prefix}-offers`}>
      {heading ? (
        <h2 id={`${prefix}-offers`} className={`${prefix}__section-title`}>
          {dictionary.profile.offers}
        </h2>
      ) : null}

      <ul className={`${prefix}__offer-list`}>
        {offers.map((offer) => (
          <li key={offer.key} className={`${prefix}__offer`} data-offer={offer.key}>
            {offer.image ? (
              <ProfileImage
                image={offer.image}
                locale={locale}
                className={`${prefix}__offer-image`}
                sizes="(min-width: 48rem) 24rem, 100vw"
              />
            ) : null}

            <div className={`${prefix}__offer-body`}>
              <Localized
                field={{ ar: offer.titleAr, en: offer.titleEn }}
                locale={locale}
                as="h3"
                className={`${prefix}__offer-title`}
              />
              <Localized
                field={{ ar: offer.descriptionAr, en: offer.descriptionEn }}
                locale={locale}
                as="p"
                className={`${prefix}__offer-note`}
              />

              <p className={`${prefix}__offer-pricing`}>
                {offer.originalPriceMinor !== null ? (
                  <s className={`${prefix}__offer-was`}>
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
                  className={`${prefix}__offer-now`}
                />
                {offer.discountPercent !== null ? (
                  <span className={`${prefix}__offer-discount`} data-discount="">
                    −{offer.discountPercent}%
                  </span>
                ) : null}
              </p>

              {offer.ctaUrl ? (
                <a
                  href={offer.ctaUrl}
                  className={`${prefix}__offer-cta`}
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
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DownloadsSection({
  downloads,
  locale,
  dictionary,
  prefix,
}: {
  downloads: PublicDownload[];
  locale: Locale;
  dictionary: Dictionary;
  prefix: string;
}) {
  if (downloads.length === 0) return null;

  return (
    <section className={`${prefix}__downloads`} aria-labelledby={`${prefix}-downloads`}>
      <h2 id={`${prefix}-downloads`} className={`${prefix}__section-title`}>
        {dictionary.profile.downloads}
      </h2>

      <ul className={`${prefix}__download-list`}>
        {downloads.map((download) => (
          <li key={download.key} className={`${prefix}__download`}>
            <a
              href={download.url}
              className={`${prefix}__download-link`}
              data-download={download.key}
              data-event={download.kind === 'link' ? 'external_menu' : 'download_click'}
              {...(download.kind === 'link'
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
            >
              <Localized
                field={{ ar: download.titleAr, en: download.titleEn }}
                locale={locale}
                className={`${prefix}__download-title`}
              />
              <span className={`${prefix}__download-meta`}>
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
              className={`${prefix}__download-note`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ContactSection({
  actions,
  socials,
  addressAr,
  addressEn,
  locale,
  dictionary,
  prefix,
  children,
}: {
  actions: { key: string; href: string; label: string; event: string; external: boolean }[];
  socials: { key: string; href: string; label: string; event: string }[];
  addressAr: string | null;
  addressEn: string | null;
  locale: Locale;
  dictionary: Dictionary;
  prefix: string;
  children?: ReactNode;
}) {
  const hasAnything = actions.length > 0 || socials.length > 0 || addressAr || addressEn;
  if (!hasAnything) return null;

  return (
    <section className={`${prefix}__contact`} aria-labelledby={`${prefix}-contact`}>
      <h2 id={`${prefix}-contact`} className={`${prefix}__section-title`}>
        {dictionary.profile.contact}
      </h2>

      {actions.length > 0 ? (
        <div className={`${prefix}__actions`}>
          {actions.map((action) => (
            <a
              key={action.key}
              href={action.href}
              className={`${prefix}__action`}
              data-event={action.event}
              {...(action.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {action.label}
            </a>
          ))}
        </div>
      ) : null}

      <Localized
        field={{ ar: addressAr, en: addressEn }}
        locale={locale}
        as="p"
        className={`${prefix}__address`}
      />

      {socials.length > 0 ? (
        <nav aria-label="Social" className={`${prefix}__social`}>
          {socials.map((link) => (
            <a
              key={link.key}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`${prefix}__social-link`}
              data-event={link.event}
            >
              {link.label}
            </a>
          ))}
        </nav>
      ) : null}

      {children}
    </section>
  );
}
