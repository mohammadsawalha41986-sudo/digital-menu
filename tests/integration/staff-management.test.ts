import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import {
  changeOwnPassword,
  createStaffUser,
  grantBusinessAccess,
  listStaff,
  resetStaffPassword,
  revokeBusinessAccess,
  setPlatformRole,
  setStaffActive,
} from '@/server/admin/user-service';
import { resolveTenantContext } from '@/server/tenancy/context';
import { verifyPassword } from '@/server/auth/password';
import { resolveDatabase } from '../database';

/**
 * Staff management, and the two rules that matter most about it: a staff user
 * reaches only what they were granted, and nobody can lock the platform out of
 * itself.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });

const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const EMAILS = [
  'staff-fixture-admin@example.test',
  'staff-fixture-one@example.test',
  'staff-fixture-two@example.test',
];

let admin = { id: '', role: 'SUPER_ADMIN' as const };
let businessId = '';

async function removeFixture() {
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

beforeAll(async () => {
  if (!databaseReachable) return;
  await removeFixture();

  const created = await prisma.user.create({
    data: { email: EMAILS[0]!, name: 'Fixture Admin', role: 'SUPER_ADMIN' },
  });
  admin = { id: created.id, role: 'SUPER_ADMIN' };

  const business = await prisma.business.findFirstOrThrow({
    where: { publicId: 'DEM001' },
    select: { id: true },
  });
  businessId = business.id;
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

describe.skipIf(!databaseReachable)('staff management', () => {
  it('creates an account with a working generated password', async () => {
    const { user, password } = await createStaffUser(admin, {
      email: EMAILS[1]!,
      name: 'Fixture One',
      role: 'STAFF',
    });

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true, role: true },
    });

    expect(stored.role).toBe('STAFF');
    expect(await verifyPassword(password, stored.passwordHash!)).toBe(true);
    // The plaintext is never persisted anywhere.
    expect(stored.passwordHash).not.toContain(password);
  });

  it('refuses a duplicate email rather than silently reusing the account', async () => {
    await expect(
      createStaffUser(admin, { email: EMAILS[1]!, name: 'Again', role: 'STAFF' }),
    ).rejects.toThrow(/already exists/i);
  });

  it('a new staff user can reach nothing until granted', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS[1]! } });

    expect(await resolveTenantContext({ id: user.id, role: 'STAFF' }, businessId)).toBeNull();
  });

  it('a grant makes exactly one business reachable, at the granted level', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS[1]! } });

    await grantBusinessAccess(admin, user.id, businessId, 'EDITOR');

    const context = await resolveTenantContext({ id: user.id, role: 'STAFF' }, businessId);

    expect(context?.businessId).toBe(businessId);
    expect(context?.role).toBe('EDITOR');
  });

  it('revoking access closes it again', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS[1]! } });

    await revokeBusinessAccess(admin, user.id, businessId);

    expect(await resolveTenantContext({ id: user.id, role: 'STAFF' }, businessId)).toBeNull();
  });

  it('refuses to let a staff user manage staff', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS[1]! } });

    await expect(
      createStaffUser({ id: user.id, role: 'STAFF' }, {
        email: EMAILS[2]!,
        name: 'Should not exist',
        role: 'STAFF',
      }),
    ).rejects.toThrow(/super admin/i);

    await expect(listStaff({ id: user.id, role: 'STAFF' })).rejects.toThrow(/super admin/i);
  });

  it('resets a password to a new working one', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS[1]! } });
    const before = user.passwordHash;

    const { password } = await resetStaffPassword(admin, user.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(after.passwordHash).not.toBe(before);
    expect(await verifyPassword(password, after.passwordHash!)).toBe(true);
  });

  it('requires the current password to change your own', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS[1]! } });
    const { password } = await resetStaffPassword(admin, user.id);

    await expect(
      changeOwnPassword({ id: user.id, role: 'STAFF' }, 'wrong-password', 'a-new-password-1234'),
    ).rejects.toThrow(/incorrect/i);

    await changeOwnPassword({ id: user.id, role: 'STAFF' }, password, 'a-new-password-1234');

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword('a-new-password-1234', after.passwordHash!)).toBe(true);
  });

  it('deactivates an account without deleting what it created', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS[1]! } });

    await setStaffActive(admin, user.id, false);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(false);

    await setStaffActive(admin, user.id, true);
  });

  it('never lets the last super admin be demoted or deactivated', async () => {
    // Make the fixture admin the only active one for the duration of the check.
    const others = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true, id: { not: admin.id } },
      select: { id: true },
    });

    await prisma.user.updateMany({
      where: { id: { in: others.map((row) => row.id) } },
      data: { isActive: false },
    });

    try {
      await expect(setPlatformRole(admin, admin.id, 'STAFF')).rejects.toThrow(/last active/i);
      await expect(setStaffActive(admin, admin.id, false)).rejects.toThrow(/last active/i);
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: others.map((row) => row.id) } },
        data: { isActive: true },
      });
    }
  });

  it('refuses to let anyone deactivate themselves', async () => {
    await expect(setStaffActive(admin, admin.id, false)).rejects.toThrow(/your own account/i);
  });
});
