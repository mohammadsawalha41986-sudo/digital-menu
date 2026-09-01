import type { ReactNode } from 'react';
import { LOCALE_LABELS, LOCALES, bcp47Of, directionOf, type Locale } from '@/i18n/config';
import { resolveContent, type LocalizedField } from '@/i18n/content';
import { formatCalories, formatPrice } from '@/i18n/format';
import { minorUnitDigits } from '@/lib/money';
import type { Dictionary } from '@/i18n/dictionary';
import type { PublicContact, PublicImage, PublicItem } from '@/server/profile/types';

/**
 * Primitives shared by every template family.
 *
 * These carry *semantics*, not appearance: correct language tagging, correct
 * price and calorie formatting, hidden-when-absent contact actions. Each
 * template composes them into its own structure and styles them through its
 * own class names, so sharing these does not make templates look alike
 * (master spec §23; GOALS I6).
 */

/** Renders bilingual content with the language it was actually authored in. */
export function Localized({
  field,
  locale,
  as: Tag = 'span',
  className,
}: {
  field: LocalizedField;
  locale: Locale;
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'div' | 'li';
  className?: string;
}) {
  const resolved = resolveContent(field, locale);

  // Nothing authored in either language: render nothing rather than an empty
  // element (master spec §120).
  if (!resolved) return null;

  return (
    <Tag
      className={className}
      lang={bcp47Of(resolved.sourceLocale)}
      dir={directionOf(resolved.sourceLocale)}
    >
      {resolved.value}
    </Tag>
  );
}

export function hasContent(field: LocalizedField, locale: Locale): boolean {
  return resolveContent(field, locale) !== null;
}

/** Language switcher. A plain link: no JavaScript, and the path never changes. */
export function LocaleSwitcher({
  locale,
  dictionary,
  className,
  itemClassName,
}: {
  locale: Locale;
  dictionary: Dictionary;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <nav aria-label={dictionary.common.languageSwitcher} className={className}>
      {LOCALES.map((candidate) => (
        <a
          key={candidate}
          href={`?lang=${candidate}`}
          lang={bcp47Of(candidate)}
          dir={directionOf(candidate)}
          aria-current={candidate === locale ? 'true' : undefined}
          className={itemClassName}
          data-active={candidate === locale ? '' : undefined}
        >
          {LOCALE_LABELS[candidate]}
        </a>
      ))}
    </nav>
  );
}

/**
 * A price. Never visually hidden and never omitted when present (§32); absent
 * when the business has not set one, because a fabricated price is worse than
 * no price.
 */
export function Price({
  minor,
  currency,
  locale,
  className,
}: {
  minor: number | null;
  currency: string;
  locale: Locale;
  className?: string;
}) {
  if (minor === null) return null;

  return (
    <span className={className} data-price="">
      {formatPrice(minor, currency, locale, minorUnitDigits(currency))}
    </span>
  );
}

/** Calories. Rendered only when the business supplied a value (§37; GOALS I9). */
export function Calories({
  kcal,
  locale,
  className,
}: {
  kcal: number | null;
  locale: Locale;
  className?: string;
}) {
  if (kcal === null) return null;

  return (
    <span className={className} data-calories="">
      {formatCalories(kcal, locale)}
    </span>
  );
}

/** An image with locale-appropriate alt text, lazily loaded to protect LCP. */
export function ProfileImage({
  image,
  locale,
  className,
  priority = false,
  sizes,
}: {
  image: PublicImage | null;
  locale: Locale;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (!image) return null;

  const alt = resolveContent({ ar: image.altAr, en: image.altEn }, locale)?.value ?? '';

  return (
    // Media is served by the active StorageProvider, which may be an external
    // bucket the Next optimizer is not configured for; explicit dimensions and
    // lazy loading give us the properties the optimizer would have provided.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.url}
      // Generated widths, so a phone downloads a phone-sized file (§50). Absent
      // for an SVG or an upload from before derivatives existed, in which case
      // the browser simply uses `src`.
      srcSet={image.srcSet ?? undefined}
      alt={alt}
      className={className}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      sizes={sizes}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      style={{
        // The focal point, so a template cropping to a square keeps the
        // subject rather than the middle (§47, §48).
        objectPosition: image.objectPosition,
        // Explicit dimensions plus this prevent layout shift (§88).
        ...(image.width && image.height
          ? { aspectRatio: `${image.width}/${image.height}` }
          : {}),
      }}
    />
  );
}

export interface ContactAction {
  key: string;
  href: string;
  label: string;
  /** Marks the analytics event this action reports (Phase 7). */
  event: string;
  external: boolean;
}

/**
 * Builds the contact actions a business actually has. An empty field produces
 * no button at all — never a disabled or dead one (master spec §44).
 */
export function buildContactActions(
  contact: PublicContact,
  dictionary: Dictionary,
): ContactAction[] {
  const actions: ContactAction[] = [];

  if (contact.phone) {
    actions.push({
      key: 'phone',
      href: `tel:${contact.phone.replace(/\s+/g, '')}`,
      label: dictionary.profile.call,
      event: 'contact_phone',
      external: false,
    });
  }

  if (contact.whatsapp) {
    actions.push({
      key: 'whatsapp',
      href: `https://wa.me/${contact.whatsapp.replace(/[^\d]/g, '')}`,
      label: dictionary.profile.whatsapp,
      event: 'contact_whatsapp',
      external: true,
    });
  }

  if (contact.googleMapsUrl) {
    actions.push({
      key: 'maps',
      href: contact.googleMapsUrl,
      label: dictionary.profile.location,
      event: 'contact_maps',
      external: true,
    });
  }

  return actions;
}

export interface SocialLink {
  key: string;
  href: string;
  label: string;
  event: string;
}

const SOCIAL_FIELDS = [
  ['instagram', 'Instagram', 'social_instagram'],
  ['tiktok', 'TikTok', 'social_tiktok'],
  ['facebook', 'Facebook', 'social_facebook'],
  ['linkedin', 'LinkedIn', 'social_linkedin'],
  ['youtube', 'YouTube', 'social_youtube'],
  ['website', 'Website', 'social_website'],
] as const;

/** Social links, in a stable order, omitting every channel the business lacks. */
export function buildSocialLinks(contact: PublicContact): SocialLink[] {
  return SOCIAL_FIELDS.flatMap(([field, label, event]) => {
    const href = contact[field];
    return href ? [{ key: field, href, label, event }] : [];
  });
}

/**
 * Item detail as a native disclosure. No JavaScript, works before hydration,
 * keyboard-accessible for free, and each template styles it into a card, a
 * drawer or an expanded row as its composition requires (§39, §103).
 */
export function ItemDisclosure({
  item,
  locale,
  dictionary,
  className,
  summary,
  children,
}: {
  item: PublicItem;
  locale: Locale;
  dictionary: Dictionary;
  className?: string;
  summary: ReactNode;
  children?: ReactNode;
}) {
  const hasDetail =
    hasContent({ ar: item.descriptionAr, en: item.descriptionEn }, locale) ||
    hasContent({ ar: item.ingredientsAr, en: item.ingredientsEn }, locale) ||
    item.allergens.length > 0 ||
    item.gallery.length > 0;

  if (!hasDetail) {
    return (
      <div className={className} data-item={item.code}>
        {summary}
        {children}
      </div>
    );
  }

  return (
    <details className={className} data-item={item.code}>
      <summary>{summary}</summary>
      <div data-item-detail="">
        {children}
        <Localized
          field={{ ar: item.ingredientsAr, en: item.ingredientsEn }}
          locale={locale}
          as="p"
          className="item-ingredients"
        />
        {item.allergens.length > 0 ? (
          <p className="item-allergens">
            <span>{dictionary.profile.allergens}: </span>
            {item.allergens
              .map((allergen) => dictionary.allergens[allergen as keyof Dictionary['allergens']] ?? allergen)
              .join('، ')}
          </p>
        ) : null}
      </div>
    </details>
  );
}
