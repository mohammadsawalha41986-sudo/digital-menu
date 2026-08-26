import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, bcp47Of, directionOf, resolveLocale } from '@/i18n/config';
import './globals.css';

export const metadata: Metadata = {
  title: 'Digital Profile OS',
  // Public profiles set their own metadata; the platform stays out of the way
  // of a business's brand (master spec §146).
  robots: { index: false, follow: false },
};

/**
 * Root layout.
 *
 * `lang` and `dir` come from the locale negotiated in middleware, so the very
 * first byte of HTML carries the right direction — Arabic renders RTL without
 * a post-hydration flip. Individual elements that display content authored in
 * the *other* language override `lang`/`dir` locally, which is why a business
 * with Arabic-only copy still reads correctly on an English page.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  const locale = resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get('accept-language'),
  });

  return (
    <html lang={bcp47Of(locale)} dir={directionOf(locale)}>
      <body>{children}</body>
    </html>
  );
}
