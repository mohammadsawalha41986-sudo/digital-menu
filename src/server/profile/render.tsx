import { cookies, headers } from 'next/headers';
import { after } from 'next/server';
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
import { looksLikeQrScan, recordEventByPublicId } from '@/server/analytics/record';
import { AnalyticsScript } from './analytics-script';
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

export interface RenderProfileOptions {
  /**
   * Staff previewing their own work. Suppresses analytics — an operator
   * checking a draft twenty times must not appear as twenty customer visits,
   * which would make the numbers on the analytics screen a lie (GOALS I9).
   */
  preview?: boolean;
}

export async function renderProfile(
  profile: PublicProfile,
  searchParams: SearchParams,
  options: RenderProfileOptions = {},
) {
  const locale = await resolveRequestLocale(searchParams, profile.defaultLocale);
  const direction = directionOf(locale);
  const dictionary = getDictionary(locale);
  const { definition, variant } = resolveTemplate(profile.templateKey, profile.variantKey);
  const headerStore = await headers();

  // Recorded after the response is sent, so counting never delays the menu
  // and never turns a failed write into an error page (master spec §112).
  if (!options.preview) after(async () => {
    await recordEventByPublicId({
      publicId: profile.publicId,
      eventType: profile.activeBranchKey ? 'branch_view' : 'profile_view',
      branchKey: profile.activeBranchKey,
      locale,
      headers: headerStore,
    });

    // A camera app sends no referrer, so a first-party navigation with none
    // is very likely a scan. A heuristic, and documented as one.
    if (looksLikeQrScan(headerStore)) {
      await recordEventByPublicId({
        publicId: profile.publicId,
        eventType: 'qr_scan',
        branchKey: profile.activeBranchKey,
        locale,
        headers: headerStore,
      });
    }
  });

  return (
    <div
      // The profile root is the authoritative language boundary: it carries the
      // fully-resolved locale, including the business's own default, which the
      // document-level attributes cannot know without a database read.
      lang={bcp47Of(locale)}
      dir={direction}
      data-profile-root=""
      data-template={definition.key}
      data-variant={variant.key}
      data-locale={locale}
      data-branch={profile.activeBranchKey ?? undefined}
      data-preview={options.preview ? '' : undefined}
      // Brand identity enters as CSS custom properties here and nowhere else.
      style={brandTokensToStyle(profile.brand)}
    >
      {definition.render({ profile, locale, direction, dictionary })}
      {options.preview ? null : (
        <AnalyticsScript publicId={profile.publicId} branchKey={profile.activeBranchKey} locale={locale} />
      )}
    </div>
  );
}
