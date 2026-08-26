import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { brandTokensToStyle } from '@/design/brand';
import { resolveContent } from '@/i18n/content';
import {
  LOCALE_COOKIE,
  LOCALE_QUERY_PARAM,
  bcp47Of,
  directionOf,
  resolveLocale,
} from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionary';
import { getPublicProfile } from '@/server/profile/repository';
import { resolveTemplate } from '@/templates/registry';

/**
 * THE PERMANENT PUBLIC PROFILE — `/m/{publicId}`.
 *
 * This route is the destination every printed QR code points at, and the
 * single most load-bearing URL in the product. Its contract (master spec §10,
 * §11, §149–§152; GOALS I1, I2):
 *
 *   - The path contains an opaque public identifier, never a database id.
 *   - The path never changes: not when the menu changes, not when prices
 *     change, not when the brand or template changes, not when the language
 *     changes. Everything variable is resolved *behind* this URL.
 *
 * Rendering order is content → template (structure) → brand (identity), which
 * keeps template and theme independently swappable.
 */

interface PageProps {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// Read-heavy and cache-friendly, but a price change must be visible
// immediately, so the page revalidates on demand rather than on a timer.
// Explicit tag-based invalidation lands with the admin writes in Phase 3.
export const dynamic = 'force-dynamic';

async function resolveRequestLocale(
  searchParams: Record<string, string | string[] | undefined>,
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

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { publicId } = await params;
  const profile = await getPublicProfile(publicId);

  if (!profile) return { title: 'Not found', robots: { index: false, follow: false } };

  const locale = await resolveRequestLocale(await searchParams, profile.defaultLocale);
  const name = resolveContent({ ar: profile.nameAr, en: profile.nameEn }, locale);
  const description = resolveContent(
    { ar: profile.descriptionAr, en: profile.descriptionEn },
    locale,
  );

  return {
    title: name?.value ?? 'Digital profile',
    description: description?.value,
    // Per-business indexing control and full OG/hreflang generation are Phase 9
    // (§116); until a business can opt in, profiles stay out of the index.
    robots: { index: false, follow: false },
  };
}

export default async function PublicProfilePage({ params, searchParams }: PageProps) {
  const { publicId } = await params;

  // Malformed ids and non-active businesses both resolve to null; the visitor
  // sees one indistinguishable "unavailable" state either way, so the route
  // does not confirm which businesses exist.
  const profile = await getPublicProfile(publicId);
  if (!profile) notFound();

  const locale = await resolveRequestLocale(await searchParams, profile.defaultLocale);
  const direction = directionOf(locale);
  const dictionary = getDictionary(locale);
  const { definition } = resolveTemplate(profile.templateKey, profile.variantKey);

  return (
    <div
      // The profile root is the authoritative language boundary: it carries the
      // fully-resolved locale (including the business's own default), which the
      // document-level attributes cannot know without a database read.
      lang={bcp47Of(locale)}
      dir={direction}
      data-profile-root=""
      data-template={definition.key}
      data-locale={locale}
      // Brand identity enters as CSS custom properties here and nowhere else.
      style={brandTokensToStyle(profile.brand)}
    >
      {definition.render({ profile, locale, direction, dictionary })}
    </div>
  );
}
