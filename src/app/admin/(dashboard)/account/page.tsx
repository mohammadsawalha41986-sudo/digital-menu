import { requireUser } from '@/server/auth/current-user';
import { prisma } from '@/server/db/client';
import { changePasswordAction } from '@/server/admin/user-actions';
import { PasswordForm } from './password-form';

export const dynamic = 'force-dynamic';

/** Every signed-in user can change their own password, whatever their role. */
export default async function AccountPage() {
  const user = await requireUser();

  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { email: true, name: true, role: true, lastLoginAt: true },
  });

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Your account</h1>
          <p className="admin__subtitle">
            {profile.name} · {profile.email} ·{' '}
            {profile.role === 'SUPER_ADMIN' ? 'Super admin' : 'Staff'}
          </p>
        </div>
      </header>

      <section className="admin__panel">
        <h2 className="admin__panel-title">Change password</h2>
        <p className="admin__hint">
          The current password is required even though you are already signed in — an
          unattended screen is the case this closes. At least 12 characters.
        </p>
        <PasswordForm action={changePasswordAction} />
      </section>
    </>
  );
}
