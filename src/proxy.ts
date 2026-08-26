import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, LOCALE_QUERY_PARAM, resolveLocale } from '@/i18n/config';

/**
 * Locale negotiation. (Next 16 renamed this file convention from `middleware`
 * to `proxy`; the behaviour is unchanged.)
 *
 * The public URL must stay byte-identical for the life of a printed QR code
 * (GOALS I1/I2), so the locale is not a path segment. It is resolved here —
 * from `?lang=`, then a cookie, then `Accept-Language` — and written back onto
 * both the request and the response.
 *
 * Writing it onto the *request* matters: it means the root layout can read the
 * negotiated locale via `cookies()` on the very first request, so the document
 * arrives with the correct `lang`/`dir` rather than flipping after hydration.
 *
 * No database access happens here. A business's own default locale is applied
 * further down, where the profile is loaded.
 */

export default function proxy(request: NextRequest) {
  const locale = resolveLocale({
    queryParam: request.nextUrl.searchParams.get(LOCALE_QUERY_PARAM),
    cookie: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get('accept-language'),
  });

  request.cookies.set(LOCALE_COOKIE, locale);

  const response = NextResponse.next({ request });

  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false, // read by the client-side language switcher
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}

export const config = {
  // Skip static assets and Next internals; locale is irrelevant there.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads).*)'],
};
