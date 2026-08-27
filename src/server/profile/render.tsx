import { cookies, headers } from 'next/headers';
import { brandTokensToStyle } from '@/design/brand';
import {
  LOCALE_COOKIE,
  LOCALE_QUERY_PARAM,
  bcp47Of,
  directionOf,
  resolveLocale,
} from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionary';
import { resolveTemplate } from '@/templates/registry';
import type { PublicProfile } from './types';

/**
 * Shared render path for every public profile URL — the business profile and
 * the per-branch profile alike.
 *
 * Rendering order is content → template (structure) → brand (identity), which
 * is what keeps template and theme independently swappable (GOALS I6), and
 * what makes a branch URL a different *scope* rather than a different design.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export async function resolveRequestLocale(
  searchParams: SearchParams,
  businessDefault: string | null,
) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  return resolveLocale({
    queryParam: searchParams[LOCALE_QUERY_PARAM],
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get('accept-language'),
    businessDefault,
  });
}

export async function renderProfile(profile: PublicProfile, searchParams: SearchParams) {
  const locale = await resolveRequestLocale(searchParams, profile.defaultLocale);
  const direction = directionOf(locale);
  const dictionary = getDictionary(locale);
  const { definition } = resolveTemplate(profile.templateKey, profile.variantKey);

  return (
    <div
      // The profile root is the authoritative language boundary: it carries the
      // fully-resolved locale, including the business's own default, which the
      // document-level attributes cannot know without a database read.
      lang={bcp47Of(locale)}
      dir={direction}
      data-profile-root=""
      data-template={definition.key}
      data-locale={locale}
      data-branch={profile.activeBranchKey ?? undefined}
      // Brand identity enters as CSS custom properties here and nowhere else.
      style={brandTokensToStyle(profile.brand)}
    >
      {definition.render({ profile, locale, direction, dictionary })}
    </div>
  );
}
