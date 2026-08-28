'use client';

import { useState } from 'react';

/**
 * The live preview, present on every step of the flow.
 *
 * It is an iframe of `/admin/businesses/{id}/preview`, which renders the real
 * profile through the real template with the real data. Nothing here is a
 * mock-up, so what an owner approves is what a customer receives.
 *
 * `version` changes whenever a step reports a successful save, which is what
 * makes the frame reload without the owner pressing anything.
 */

const DEVICES = [
  { key: 'mobile', label: 'Mobile', width: 390, height: 760 },
  { key: 'tablet', label: 'Tablet', width: 834, height: 900 },
  { key: 'desktop', label: 'Desktop', width: 1280, height: 860 },
] as const;

export function PreviewPane({
  businessId,
  version,
  emptyHint,
}: {
  businessId: string;
  version: string;
  emptyHint?: string;
}) {
  const [device, setDevice] = useState<(typeof DEVICES)[number]['key']>('mobile');
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');

  const active = DEVICES.find((entry) => entry.key === device)!;

  return (
    <aside className="build__preview" aria-label="Live preview">
      <div className="build__preview-bar">
        <div className="studio__device-switch" role="group" aria-label="Device">
          {DEVICES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="studio__device"
              aria-pressed={device === entry.key}
              onClick={() => setDevice(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="studio__device-switch" role="group" aria-label="Language">
          <button
            type="button"
            className="studio__device"
            aria-pressed={locale === 'ar'}
            onClick={() => setLocale('ar')}
          >
            العربية
          </button>
          <button
            type="button"
            className="studio__device"
            aria-pressed={locale === 'en'}
            onClick={() => setLocale('en')}
          >
            English
          </button>
        </div>
      </div>

      <div className={`build__frame build__frame--${device}`}>
        <iframe
          key={`${device}-${locale}-${version}`}
          title="Live preview"
          src={`/admin/preview/${businessId}?lang=${locale}&v=${encodeURIComponent(version)}`}
          width={active.width}
          height={active.height}
          className="studio__iframe"
        />
      </div>

      <p className="admin__hint">
        {emptyHint ?? 'This is the real menu page, not a mock-up. It updates as you work.'}
      </p>
    </aside>
  );
}
