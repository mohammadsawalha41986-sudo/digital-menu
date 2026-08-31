import { randomBytes } from 'node:crypto';
import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { requireSuperAdmin } from '@/server/auth/current-user';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import type { AuthenticatedUser } from '@/server/tenancy/context';
import { ValidationError } from './business-service';

/**
 * Staff accounts and their grants (master spec §17–§21, §126).
 *
 * The RBAC layer was already enforced on every write — and completely
 * unassignable: accounts existed only because the seed created one, and a
 * membership could only be granted by editing the database. A platform that
 * cannot onboard a second operator without psql is not a platform.
 *
 * Three rules run through this file:
 *
 *  1. **Platform-level operations require a super admin.** Creating an account,
 *     changing someone's platform role and granting access to a business are
 *     not things a single-business operator may do.
 *
 *  2. **Nobody can lock the platform out of itself.** The last active super
 *     admin cannot be deactivated or demoted. That check is here rather than
 *     in the UI, because the UI is not the only caller.
 *
 *  3. **Passwords are set, never read.** A new account gets a generated
 *     password shown exactly once, the same pattern the seed already uses. An
 *     administrator resetting someone's password gets a new one to hand over;
 *     they never see the old.
 */

export interface StaffSummary {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'STAFF';
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  memberships: { businessId: string; businessName: string; role: string }[];
}

/** Readable, unambiguous, and long enough to satisfy the password policy. */
export function generatePassword(): string {
  // No l/I/0/O: these are read aloud and typed by hand at least once.
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(20);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

export async function listStaff(actor: AuthenticatedUser): Promise<StaffSummary[]> {
  await assertSuperAdmin(actor);

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      memberships: {
        select: {
          businessId: true,
          role: true,
          business: { select: { nameEn: true, nameAr: true } },
        },
      },
    },
  });

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    memberships: user.memberships.map((membership) => ({
      businessId: membership.businessId,
      businessName: membership.business.nameEn ?? membership.business.nameAr,
      role: membership.role,
    })),
  }));
}

async function assertSuperAdmin(actor: AuthenticatedUser) {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new ValidationError('Only a super admin may manage staff accounts');
  }
  return actor;
}

/** How many super admins could still sign in if this one went away. */
async function otherActiveSuperAdmins(excludingUserId: string): Promise<number> {
  return prisma.user.count({
    where: { role: 'SUPER_ADMIN', isActive: true, id: { not: excludingUserId } },
  });
}

export async function createStaffUser(
  actor: AuthenticatedUser,
  input: { email: string; name: string; role: 'SUPER_ADMIN' | 'STAFF' },
) {
  await assertSuperAdmin(actor);

  const email = input.email.trim().toLowerCase();

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new ValidationError('An account with that email already exists');
  }

  const password = generatePassword();

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim(),
      role: input.role,
      passwordHash: await hashPassword(password),
    },
    select: { id: true, email: true },
  });

  await recordAudit({
    action: 'user.created',
    entity: 'user',
    entityId: user.id,
    userId: actor.id,
    metadata: { email: user.email, role: input.role },
  });

  // Returned once, to be handed over. Never stored in plaintext, never
  // retrievable afterwards — a reset is the only way back.
  return { user, password };
}

export async function setStaffActive(
  actor: AuthenticatedUser,
  userId: string,
  isActive: boolean,
) {
  await assertSuperAdmin(actor);

  const target = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, role: true, isActive: true },
  });

  if (!isActive && target.role === 'SUPER_ADMIN' && (await otherActiveSuperAdmins(userId)) === 0) {
    throw new ValidationError(
      'This is the last active super admin. Promote someone else before deactivating this account.',
    );
  }

  if (!isActive && target.id === actor.id) {
    throw new ValidationError('You cannot deactivate your own account.');
  }

  await prisma.user.update({ where: { id: userId }, data: { isActive } });

  await recordAudit({
    action: isActive ? 'user.activated' : 'user.deactivated',
    entity: 'user',
    entityId: userId,
    userId: actor.id,
    metadata: { email: target.email },
  });
}

export async function setPlatformRole(
  actor: AuthenticatedUser,
  userId: string,
  role: 'SUPER_ADMIN' | 'STAFF',
) {
  await assertSuperAdmin(actor);

  const target = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });

  if (
    role === 'STAFF' &&
    target.role === 'SUPER_ADMIN' &&
    (await otherActiveSuperAdmins(userId)) === 0
  ) {
    throw new ValidationError(
      'This is the last active super admin. Promote someone else before demoting this account.',
    );
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });

  await recordAudit({
    action: 'user.role_changed',
    entity: 'user',
    entityId: userId,
    userId: actor.id,
    metadata: { email: target.email, from: target.role, to: role },
  });
}

export async function resetStaffPassword(actor: AuthenticatedUser, userId: string) {
  await assertSuperAdmin(actor);

  const target = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true },
  });

  const password = generatePassword();

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });

  await recordAudit({
    action: 'user.password_reset',
    entity: 'user',
    entityId: userId,
    userId: actor.id,
    metadata: { email: target.email },
  });

  return { password };
}

/**
 * Changing one's own password.
 *
 * Requires the current password even though the session already proves
 * identity: an unattended terminal is the threat this closes, and it is the
 * one case where re-authentication costs the legitimate user nothing.
 */
export async function changeOwnPassword(
  actor: AuthenticatedUser,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { id: true, passwordHash: true, email: true },
  });

  if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ValidationError('Current password is incorrect');
  }

  if (currentPassword === newPassword) {
    throw new ValidationError('The new password must differ from the current one');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  await recordAudit({
    action: 'user.password_changed',
    entity: 'user',
    entityId: user.id,
    userId: actor.id,
  });
}

/* --- Business grants ------------------------------------------------------ */

export async function grantBusinessAccess(
  actor: AuthenticatedUser,
  userId: string,
  businessId: string,
  role: 'VIEWER' | 'EDITOR' | 'MANAGER' | 'OWNER',
) {
  await assertSuperAdmin(actor);

  const [user, business] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
    prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { nameAr: true, nameEn: true },
    }),
  ]);

  await prisma.businessMembership.upsert({
    where: { userId_businessId: { userId, businessId } },
    update: { role },
    create: { userId, businessId, role },
  });

  await recordAudit({
    action: 'membership.granted',
    entity: 'user',
    entityId: userId,
    businessId,
    userId: actor.id,
    metadata: { email: user.email, business: business.nameEn ?? business.nameAr, role },
  });
}

export async function revokeBusinessAccess(
  actor: AuthenticatedUser,
  userId: string,
  businessId: string,
) {
  await assertSuperAdmin(actor);

  await prisma.businessMembership.deleteMany({ where: { userId, businessId } });

  await recordAudit({
    action: 'membership.revoked',
    entity: 'user',
    entityId: userId,
    businessId,
    userId: actor.id,
  });
}

/** Re-exported so the page can guard before rendering anything. */
export { requireSuperAdmin };
