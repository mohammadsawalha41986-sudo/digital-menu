import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, bcp47Of, directionOf, resolveLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionary';

/**
 * Visitor-facing unavailable state (master spec §119).
 *
 * Deliberately says nothing about *why*: a mistyped code, a draft business and
 * a deactivated business look identical from outside. No technical detail is
 * exposed, and the platform brand stays absent.
 */
export default async function ProfileNotFound() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get('accept-language'),
  });
  const dictionary = getDictionary(locale);

  return (
    <main
      lang={bcp47Of(locale)}
      dir={directionOf(locale)}
      data-profile-root=""
      style={{
        maxInlineSize: '34rem',
        marginInline: 'auto',
        paddingInline: 'var(--sys-space-4)',
        paddingBlock: 'var(--sys-space-9)',
        textAlign: 'start',
      }}
    >
      <h1 style={{ fontSize: 'var(--sys-font-size-2xl)' }}>
        {dictionary.errors.profileNotFoundTitle}
      </h1>
      <p style={{ marginBlockStart: 'var(--sys-space-4)', color: 'var(--brand-color-muted)' }}>
        {dictionary.errors.profileNotFoundBody}
      </p>
    </main>
  );
}
