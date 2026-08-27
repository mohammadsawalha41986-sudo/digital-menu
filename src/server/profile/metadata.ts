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
  branchKey?: string,
): Promise<Metadata> {
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
  const path = branchKey
    ? `/m/${profile.publicId}/b/${branchKey}`
    : `/m/${profile.publicId}`;
  const canonical = `${base}${path}`;

  const languages = Object.fromEntries(
    LOCALES.map((candidate) => [bcp47Of(candidate), `${canonical}?lang=${candidate}`]),
  );

  return {
    title,
    description,
    alternates: { canonical, languages },
    robots: profile.seo.indexProfile
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      locale: bcp47Of(locale),
      images: profile.seo.ogImage?.url
        ? [{ url: `${base}${profile.seo.ogImage.url}` }]
        : profile.logo?.url
          ? [{ url: `${base}${profile.logo.url}` }]
          : undefined,
    },
  };
}
