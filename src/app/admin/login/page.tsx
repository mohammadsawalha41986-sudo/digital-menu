import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/current-user';
import { SignInForm } from './form';

export const metadata: Metadata = { title: 'Sign in — Digital Profile OS' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // An already-signed-in operator should not be shown a login form.
  if (await getCurrentUser()) redirect('/admin');

  return (
    <div className="admin__login">
      <div className="admin__login-card">
        <div>
          <h1 className="admin__title">Sign in</h1>
          <p className="admin__subtitle">Staff access to Digital Profile OS.</p>
        </div>
        <SignInForm />
      </div>
    </div>
  );
}
