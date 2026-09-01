import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/dictionary';
import type { PublicDownload, PublicOffer } from '@/server/profile/types';
import {
  WEEKDAYS,
  hasPublishedHours,
  localNow,
  openStateOf,
  type Weekday,
  type WorkingHours,
} from '@/server/business/hours';
import { formatClock } from '@/i18n/format';
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
  printHref,
}: {
  downloads: PublicDownload[];
  locale: Locale;
  dictionary: Dictionary;
  prefix: string;
  /** The printable menu, offered alongside whatever files the business uploaded. */
  printHref?: string;
}) {
  // The printable menu alone is reason enough for the section: a business with
  // no uploaded files still has a menu worth taking away.
  if (downloads.length === 0 && !printHref) return null;

  return (
    <section className={`${prefix}__downloads`} aria-labelledby={`${prefix}-downloads`}>
      <h2 id={`${prefix}-downloads`} className={`${prefix}__section-title`}>
        {dictionary.profile.downloads}
      </h2>

      <ul className={`${prefix}__download-list`}>
        {printHref ? (
          <li className={`${prefix}__download`} data-download="print">
            <a href={printHref} className={`${prefix}__download-link`} data-event="pdf_open">
              {dictionary.profile.printableMenu}
            </a>
          </li>
        ) : null}

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

/**
 * Opening hours, with a live open/closed badge (master spec §21, §44, §74).
 *
 * The state is computed on the server in the *business's* timezone, so the
 * page arrives already knowing the answer — no client clock, no hydration
 * flash, and correct for a visitor in another country.
 *
 * Times are rendered as locale-formatted clock times rather than as the stored
 * `HH:MM`, so an Arabic visitor sees Arabic numerals where the locale calls
 * for them. A day the business marked closed says so; a day it never described
 * is simply absent, per the rule that missing data hides its field.
 */
export function HoursSection({
  hours,
  locale,
  dictionary,
  prefix,
  heading = true,
}: {
  hours: WorkingHours | null;
  locale: Locale;
  dictionary: Dictionary;
  prefix: string;
  heading?: boolean;
}) {
  if (!hasPublishedHours(hours)) return null;

  const state = openStateOf(hours);
  const today = localNow(hours.timezone)?.weekday ?? null;

  const days = WEEKDAYS.map((day) => ({ day, entry: hours.days[day] })).filter(
    (row): row is { day: Weekday; entry: NonNullable<typeof row.entry> } => Boolean(row.entry),
  );

  return (
    <section className={`${prefix}__hours`} aria-labelledby={`${prefix}-hours`}>
      {heading ? (
        <h2 id={`${prefix}-hours`} className={`${prefix}__section-title`}>
          {dictionary.profile.workingHours}
        </h2>
      ) : null}

      {state.status !== 'unknown' ? (
        <p
          className={`${prefix}__hours-state`}
          data-open={state.status === 'open' ? 'true' : 'false'}
        >
          <span className={`${prefix}__hours-badge`}>
            {state.status === 'open' ? dictionary.hours.openNow : dictionary.hours.closedNow}
          </span>
          <span className={`${prefix}__hours-detail`}>
            {state.status === 'open'
              ? dictionary.hours.closesAt.replace('{time}', formatClock(state.closesAt, locale))
              : state.opensAt === null
                ? ''
                : state.opensDay === today
                  ? dictionary.hours.opensAt.replace(
                      '{time}',
                      formatClock(state.opensAt, locale),
                    )
                  : dictionary.hours.opensDayAt
                      .replace('{day}', dictionary.weekdays[state.opensDay])
                      .replace('{time}', formatClock(state.opensAt, locale))}
          </span>
        </p>
      ) : null}

      <dl className={`${prefix}__hours-list`}>
        {days.map(({ day, entry }) => (
          <div
            key={day}
            className={`${prefix}__hours-row`}
            {...(day === today ? { 'data-today': '' } : {})}
          >
            <dt className={`${prefix}__hours-day`}>{dictionary.weekdays[day]}</dt>
            <dd className={`${prefix}__hours-times`}>
              {entry.closed || entry.intervals.length === 0 ? (
                dictionary.hours.closedAllDay
              ) : (
                <ul className={`${prefix}__hours-intervals`}>
                  {entry.intervals.map((interval) => (
                    <li key={`${interval.opens}-${interval.closes}`}>
                      <time>{formatClock(interval.opens, locale)}</time>
                      {' – '}
                      <time>{formatClock(interval.closes, locale)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * HERO placement — one offer given the top of the page.
 *
 * Deliberately not a smaller `OffersSection`: it is a single figure with the
 * image running full-bleed behind the copy, no heading above it, and the
 * discount rendered as the largest number in the composition. A business that
 * chose HERO asked for the offer to *be* the first thing, and the markup has
 * to make that possible for the stylesheet.
 */
export function HeroOffer({
  offer,
  locale,
  dictionary,
  prefix,
}: {
  offer: PublicOffer | null;
  locale: Locale;
  dictionary: Dictionary;
  prefix: string;
}) {
  if (!offer) return null;

  return (
    <section
      className={`${prefix}__hero-offer`}
      data-offer={offer.key}
      data-placement="hero"
      aria-label={dictionary.profile.offers}
    >
      {offer.image ? (
        <ProfileImage
          image={offer.image}
          locale={locale}
          className={`${prefix}__hero-offer-image`}
          sizes="100vw"
        />
      ) : null}

      <div className={`${prefix}__hero-offer-body`}>
        {offer.discountPercent !== null ? (
          <p className={`${prefix}__hero-offer-discount`} data-discount="">
            −{offer.discountPercent}%
          </p>
        ) : null}

        <Localized
          field={{ ar: offer.titleAr, en: offer.titleEn }}
          locale={locale}
          as="h2"
          className={`${prefix}__hero-offer-title`}
        />
        <Localized
          field={{ ar: offer.descriptionAr, en: offer.descriptionEn }}
          locale={locale}
          as="p"
          className={`${prefix}__hero-offer-note`}
        />

        <p className={`${prefix}__hero-offer-pricing`}>
          {offer.originalPriceMinor !== null ? (
            <s className={`${prefix}__hero-offer-was`}>
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
            className={`${prefix}__hero-offer-now`}
          />
        </p>

        {offer.ctaUrl ? (
          <a
            href={offer.ctaUrl}
            className={`${prefix}__hero-offer-cta`}
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
    </section>
  );
}

/**
 * BANNER placement — slim, full-width strips.
 *
 * One line of type per offer, no image, no heading: this is the announcement
 * that runs above the menu without displacing it ("Free delivery on Thursdays").
 * Several can run at once, which is why it is a list and HERO is not.
 */
export function OfferBanners({
  offers,
  locale,
  prefix,
}: {
  offers: PublicOffer[];
  locale: Locale;
  prefix: string;
}) {
  if (offers.length === 0) return null;

  return (
    <aside className={`${prefix}__offer-banners`} data-placement="banner">
      {offers.map((offer) => {
        const body = (
          <>
            <Localized
              field={{ ar: offer.titleAr, en: offer.titleEn }}
              locale={locale}
              as="span"
              className={`${prefix}__offer-banner-title`}
            />
            {offer.discountPercent !== null ? (
              <span className={`${prefix}__offer-banner-discount`} data-discount="">
                −{offer.discountPercent}%
              </span>
            ) : (
              <Price
                minor={offer.offerPriceMinor}
                currency={offer.currency}
                locale={locale}
                className={`${prefix}__offer-banner-price`}
              />
            )}
          </>
        );

        return offer.ctaUrl ? (
          <a
            key={offer.key}
            className={`${prefix}__offer-banner`}
            data-offer={offer.key}
            href={offer.ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-event="offer_cta"
          >
            {body}
          </a>
        ) : (
          <p key={offer.key} className={`${prefix}__offer-banner`} data-offer={offer.key}>
            {body}
          </p>
        );
      })}
    </aside>
  );
}
