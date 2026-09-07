import type { Metadata } from 'next';
import { getEnv } from '@/lib/env';
import { resolveContent } from '@/i18n/content';
import { LOCALES, bcp47Of } from '@/i18n/config';
import { resolveRequestLocale, type SearchParams } from './render';
import type { PublicProfile } from './types';

/**
 * Public profile metadata (master spec §116, §117).
 *
 * Indexing is opt-in per business: a profile stays out of search results until
 * staff explicitly enable it. Canonical and hreflang always point at the
 * permanent path, never at a locale-specific one, so a shared link and a
 * scanned QR resolve to the same canonical URL (GOALS I1).
 */
export async function buildProfileMetadata(
  profile: PublicProfile | null,
  searchParams: SearchParams,
  scope: { branchKey?: string; menuKey?: string } | string = {},
): Promise<Metadata> {
  // Accepts the old positional branch key so the branch route needs no change.
  const { branchKey, menuKey } =
    typeof scope === 'string' ? { branchKey: scope, menuKey: undefined } : scope;

  if (!profile) {
    return { title: 'Not found', robots: { index: false, follow: false } };
  }

  const locale = await resolveRequestLocale(searchParams, profile.defaultLocale);

  const title =
    resolveContent(
      { ar: profile.seo.metaTitleAr ?? profile.nameAr, en: profile.seo.metaTitleEn ?? profile.nameEn },
      locale,
    )?.value ?? profile.nameAr;

  const description = resolveContent(
    {
      ar: profile.seo.metaDescriptionAr ?? profile.descriptionAr,
      en: profile.seo.metaDescriptionEn ?? profile.descriptionEn,
    },
    locale,
  )?.value;

  const base = getEnv().PUBLIC_URL.replace(/\/$/, '');
  const path = menuKey
    ? `/m/${profile.publicId}/menu/${menuKey}`
    : branchKey
      ? `/m/${profile.publicId}/b/${branchKey}`
      : `/m/${profile.publicId}`;
  const canonical = `${base}${path}`;

  // A single menu's page is titled for that menu, not for the business, so a
  // search result and a shared link say which menu they lead to.
  const menu = menuKey ? profile.menus.find((candidate) => candidate.key === menuKey) : undefined;
  const menuTitle = menu
    ? resolveContent({ ar: menu.titleAr, en: menu.titleEn }, locale)?.value
    : undefined;

  const languages = Object.fromEntries(
    LOCALES.map((candidate) => [bcp47Of(candidate), `${canonical}?lang=${candidate}`]),
  );

  const pageTitle = menuTitle ? `${menuTitle} — ${title}` : title;
  const pageDescription = menu
    ? (resolveContent({ ar: menu.descriptionAr, en: menu.descriptionEn }, locale)?.value ??
       description)
    : description;

  return {
    title: pageTitle,
    description: pageDescription,
    alternates: { canonical, languages },
    robots: profile.seo.indexProfile
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      title: pageTitle,
      description: pageDescription,
      url: canonical,
      type: 'website',
      locale: bcp47Of(locale),
      images: menu?.cover?.url
        ? [{ url: `${base}${menu.cover.url}` }]
        : profile.seo.ogImage?.url
        ? [{ url: `${base}${profile.seo.ogImage.url}` }]
        : profile.logo?.url
          ? [{ url: `${base}${profile.logo.url}` }]
          : undefined,
    },
  };
}
