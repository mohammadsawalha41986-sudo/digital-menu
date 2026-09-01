import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { listStaff } from '@/server/admin/user-service';
import { prisma } from '@/server/db/client';
import {
  createStaffAction,
  grantAccessAction,
  resetStaffPasswordAction,
  revokeAccessAction,
  setPlatformRoleAction,
  setStaffActiveAction,
} from '@/server/admin/user-actions';
import { StaffManager } from './manager';

export const dynamic = 'force-dynamic';

/**
 * Staff accounts and business grants (§17–§21).
 *
 * Super-admin only, and a 404 rather than a 403 for everyone else: a staff
 * user has no business learning that this screen exists.
 */
export default async function StaffPage() {
  const user = await requireUser();

  if (user.role !== 'SUPER_ADMIN') notFound();

  const [staff, businesses] = await Promise.all([
    listStaff(user),
    prisma.business.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, publicId: true, nameAr: true, nameEn: true },
    }),
  ]);

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Staff</h1>
          <p className="admin__subtitle">
            Accounts, platform roles, and which businesses each person may work on.
          </p>
        </div>
      </header>

      <StaffManager
        currentUserId={user.id}
        staff={staff.map((person) => ({
          ...person,
          lastLoginAt: person.lastLoginAt?.toISOString() ?? null,
          createdAt: person.createdAt.toISOString(),
        }))}
        businesses={businesses.map((business) => ({
          id: business.id,
          label: `${business.nameEn ?? business.nameAr} (${business.publicId})`,
        }))}
        createStaff={createStaffAction}
        grantAccess={grantAccessAction}
        revokeAccess={revokeAccessAction}
        setActive={setStaffActiveAction}
        setRole={setPlatformRoleAction}
        resetPassword={resetStaffPasswordAction}
      />
    </>
  );
}
