import Link from 'next/link';
import { requireUser } from '@/server/auth/current-user';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import { ProjectForm } from './project-form';

export const dynamic = 'force-dynamic';

/**
 * Step 1 — the first screen a new customer sees.
 *
 * Five fields, no vocabulary from the database. The slug, the public id, the
 * template key, the locale and the initial brand row are all derived; asking
 * an owner for them would be asking them to do the platform's job.
 */
export default async function CreatePage() {
  await requireUser();

  return (
    <div className="build build--single">
      <div className="build__main">
        <header className="build__intro">
          <p className="build__eyebrow">Step 1 of 10</p>
          <h1 className="build__title">Let’s create your digital menu</h1>
          <p className="build__lede">
            Two minutes of setup. You can change everything afterwards, and nothing is public
            until you say so.
          </p>
        </header>

        <ProjectForm currencies={[...SUPPORTED_CURRENCIES]} />

        <p className="admin__hint">
          Prefer the detailed screens? <Link href="/admin/businesses">Open the business list</Link>.
        </p>
      </div>
    </div>
  );
}
