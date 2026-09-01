'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { formDataToObject, signInSchema } from '@/server/admin/validation';
import { verifyPassword } from './password';
import { RULES, consume, reset } from '@/server/security/rate-limit';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from './session';

/**
 * Sign-in and sign-out.
 *
 * Deliberate properties:
 *  - One error message for every failure. "No such user" and "wrong password"
 *    must be indistinguishable, or the form becomes an account enumerator.
 *  - A password verification runs even when no user matched, so response time
 *    does not leak whether an address exists.
 *  - The session cookie is httpOnly and SameSite=Lax, and Secure in production.
 *  - Attempts are rate limited on two axes: per account, so one address cannot
 *    be guessed at; and per client, so one source cannot spray many addresses.
 *    Both windows are refused with the same generic message, because telling an
 *    attacker they have been throttled tells them the account exists.
 */

const GENERIC_FAILURE = 'Incorrect email or password';

/** A real scrypt hash to compare against when no user matched. */
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$vJ8w3pQjZ0m0m4Q0m4Q0m4Q0m4Q0m4Q0m4Q0m4Q0m4Q=';

export interface SignInState {
  error?: string;
}

export async function signInAction(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) return { error: GENERIC_FAILURE };

  const headerStore = await headers();
  const client =
    headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headerStore.get('x-real-ip')?.trim() ||
    'unknown';

  // Both counters are consumed before any lookup, so a throttled attempt costs
  // no database work and reveals nothing by timing.
  const byAccount = consume(RULES.loginAccount, parsed.data.email.toLowerCase());
  const byClient = consume(RULES.loginClient, client);

  if (byAccount.limited || byClient.limited) {
    return { error: GENERIC_FAILURE };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true, isActive: true },
  });

  const matches = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !user.isActive || !matches) {
    return { error: GENERIC_FAILURE };
  }

  // A correct password clears the account's window; a legitimate operator who
  // mistyped twice is not locked out for the rest of the quarter hour.
  reset(RULES.loginAccount, parsed.data.email.toLowerCase());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit({
    action: 'user.signed_in',
    entity: 'user',
    entityId: user.id,
    userId: user.id,
  });

  redirect('/admin');
}

export async function signOutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect('/admin/login');
}
