import { getEnv } from '@/lib/env';
import type { PublicProfile } from './types';

/**
 * schema.org data for a restaurant's public menu, for search engines.
 *
 * Only what the restaurant itself entered: name, the menu's permanent link,
 * logo, phone, address and its own social links. Never ratings, reviews or
 * anything inferred — a search engine shows these to people as facts.
 */
export function buildRestaurantJsonLd(profile: PublicProfile): Record<string, unknown> {
  const base = getEnv().PUBLIC_URL.replace(/\/$/, '');
  const url = `${base}/m/${profile.publicId}`;
  const absolute = (value: string | null | undefined) => {
    if (!value) return undefined;
    try {
      return new URL(value, `${base}/`).toString();
    } catch {
      return undefined;
    }
  };
  const contact = profile.contact;
  const address = contact?.addressEn ?? contact?.addressAr ?? null;
  const sameAs = [contact?.website, contact?.instagram, contact?.facebook, contact?.tiktok, contact?.youtube, contact?.linkedin]
    .map((link) => (link && /^https?:\/\//i.test(link) ? link : null))
    .filter((link): link is string => Boolean(link));
  const logo = absolute(profile.logo?.url);
  const name = profile.nameEn?.trim() || profile.nameAr;

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name,
    url,
    hasMenu: url,
  };
  if (profile.nameEn?.trim() && profile.nameAr !== profile.nameEn) data.alternateName = profile.nameAr;
  if (logo) {
    data.logo = logo;
    data.image = logo;
  }
  if (contact?.phone) data.telephone = contact.phone;
  if (address) data.address = { '@type': 'PostalAddress', streetAddress: address };
  if (sameAs.length > 0) data.sameAs = sameAs;
  return data;
}

/** JSON for a <script> element: `<` is escaped so no entered text can close the tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
