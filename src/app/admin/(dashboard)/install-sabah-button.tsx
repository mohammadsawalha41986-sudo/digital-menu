'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

/**
 * One-click installer for the Sabah El Lail demo restaurant on a fresh
 * environment. Rendered on the dashboard for SUPER_ADMINs when `SBH001` is
 * not yet in the database — hidden once it is, so the button never offers
 * to "install" something that already exists.
 */
export function InstallSabahButton({ installed }: { installed: boolean }) {
  const [state, setState] = useState<'idle' | 'done' | 'error'>(installed ? 'done' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const install = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/install-sabah-demo', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        });
        const body = (await response.json()) as {
          ok?: boolean;
          publicId?: string;
          categoryCount?: number;
          itemCount?: number;
          error?: string;
        };
        if (!response.ok || !body.ok) {
          setState('error');
          setMessage(body.error ?? `Install failed (${response.status}).`);
          return;
        }
        setState('done');
        setMessage(
          `Installed ${body.categoryCount} categories, ${body.itemCount} items. Open /m/${body.publicId} to see it.`,
        );
      } catch (error) {
        setState('error');
        setMessage(error instanceof Error ? error.message : 'Install failed.');
      }
    });
  };

  if (state === 'done') {
    return (
      <div className="install-sabah install-sabah--done">
        <p className="install-sabah__message">
          <strong>Sabah El Lail demo is installed.</strong>{' '}
          {message ?? (
            <>
              Open <Link href="/m/SBH001">/m/SBH001</Link> to see the Street Food template end-to-end.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="install-sabah" data-state={state}>
      <div className="install-sabah__copy">
        <p className="install-sabah__title">
          <strong>Try the Street Food template</strong> with a real demo restaurant
        </p>
        <p className="install-sabah__detail">
          One click provisions Sabah El Lail — 11 categories, 25+ items with photography,
          brand palette, logo, and WhatsApp ordering. Safe to re-run; nothing else is touched.
        </p>
      </div>
      <button
        type="button"
        className="admin__button"
        onClick={install}
        disabled={pending}
      >
        {pending ? 'Installing…' : 'Install Sabah El Lail'}
      </button>
      {state === 'error' && message ? (
        <p className="install-sabah__error">{message}</p>
      ) : null}
    </div>
  );
}
