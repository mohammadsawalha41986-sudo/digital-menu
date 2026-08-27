import { cookies } from 'next/headers';
import { cache } from 'react';
import { prisma } from '@/server/db/client';
import type { AuthenticatedUser } from '@/server/tenancy/context';
import { SESSION_COOKIE, readSessionToken } from './session';

/**
 * The authenticated staff user for the current request, or null.
 *
 * Wrapped in React's `cache` so several server components in one render share
 * a single database read.
 *
 * The token is trusted only for *identity*; the role is always re-read from
 * the database. A token minted before a demotion must not keep its old
 * privileges, and role is the input to every authorization decision.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const cookieStore = await cookies();
  const payload = readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);

  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true, isActive: true },
  });

  // A deactivated account stops working immediately, without waiting for its
  // token to expire.
  if (!user || !user.isActive) return null;

  return { id: user.id, role: user.role };
});

export class UnauthenticatedError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'UnauthenticatedError';
  }
}

/** For server actions and route handlers that must not proceed anonymously. */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

/** Platform-level guard, distinct from per-business membership. */
export async function requireSuperAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (user.role !== 'SUPER_ADMIN') throw new UnauthenticatedError();
  return user;
}
