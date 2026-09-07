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
import { preloadFontsFor } from '@/menu-studio/typography';
import { looksLikeQrScan, recordEventByPublicId } from '@/server/analytics/record';
import { AnalyticsScript } from './analytics-script';
import { EmbedHeightScript } from './embed-script';
import { MenuSearch } from './menu-search';
import { menuSearchStrings } from './menu-search-strings';
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

/** Item count at which the public menu offers a search box. */
const MENU_SEARCH_THRESHOLD = 6;

function countItems(profile: PublicProfile): number {
  return profile.menus.reduce(
    (total, menu) =>
      total + menu.categories.reduce((n, category) => n + category.items.length, 0),
    0,
  );
}

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
  /**
   * Rendered inside someone else's page (`/embed/...`).
   *
   * Analytics still record — an embedded menu is a real customer looking at a
   * real menu, and not counting it would make the numbers wrong in the other
   * direction. What changes is chrome: an embed is a component on a host page,
   * so it must not paint a full-viewport background over that page, and the
   * host's own header already says whose restaurant this is.
   */
  embed?: boolean;
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

  // Only the faces this business chose, and only the script this page is being
  // drawn in. A profile is one screen of text behind a QR code; it should not
  // spend a mobile connection on glyphs it will never render (§33, §81).
  const preloads = preloadFontsFor(
    [profile.brand.fontHeading, profile.brand.fontBody],
    locale === 'ar' ? 'arabic' : 'latin',
  );

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
      data-embed={options.embed ? '' : undefined}
      // Brand identity enters as CSS custom properties here and nowhere else.
      style={brandTokensToStyle(profile.brand)}
    >
      {preloads.map((href) => (
        <link key={href} rel="preload" as="font" type="font/woff2" href={href} crossOrigin="" />
      ))}

      {definition.render({ profile, locale, direction, dictionary })}
      {options.preview ? null : (
        <AnalyticsScript publicId={profile.publicId} branchKey={profile.activeBranchKey} locale={locale} />
      )}
      {/* Rendered last and relocated by its own script — see MenuSearch.

          Offered from six items up. That is roughly where a menu stops fitting
          on one phone screen, and past the fold "search" beats "scroll and
          hope". Below it the control would be a box that finds things already
          visible, which is clutter rather than help. */}
      {countItems(profile) >= MENU_SEARCH_THRESHOLD ? (
        <MenuSearch strings={menuSearchStrings(locale)} />
      ) : null}
      {options.embed ? <EmbedHeightScript /> : null}
    </div>
  );
}
