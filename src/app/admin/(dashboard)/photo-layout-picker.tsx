'use client';

import { startTransition, useActionState, useState } from 'react';
import type { ActionState } from '@/server/admin/actions';
import { DEFAULT_TEMPLATE_KEY } from '@/templates/registry';

export interface PhotoLayout {
  key: string;
  label: string;
  description: string;
}

// Owners read Arabic first; the registry's English labels stay as the
// secondary line so staff and owners name the same thing.
const ARABIC: Record<string, { label: string; description: string }> = {
  a: { label: 'بطاقات صور', description: 'الأطباق كبطاقات بالصور في شبكة.' },
  b: { label: 'قائمة', description: 'صفوف مختصرة بصورة صغيرة — مناسبة للمنيو الطويل.' },
  c: { label: 'صور كبيرة', description: 'صورة كبيرة لكل طبق — مناسبة عندما تكون الصور قوية.' },
};

/**
 * The one look decision besides colours and fonts: how dish photos are laid
 * out. Each card frames *this restaurant's* menu in that layout, so the owner
 * compares their own dishes rather than a stock screenshot.
 */
export function PhotoLayoutPicker({
  businessId,
  layouts,
  current,
  action,
}: {
  businessId: string;
  layouts: readonly PhotoLayout[];
  current: string;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, submit, isPending] = useActionState<ActionState, FormData>(action, {});
  const [selected, setSelected] = useState(
    layouts.some((layout) => layout.key === current) ? current : (layouts[0]?.key ?? 'a'),
  );

  return (
    <form
      // Submitted by hand rather than through `action`: React resets a form
      // after its action, which put the chosen layout back to the old one.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => submit(data));
      }}
      className="build__stack"
    >
      {state.error ? (
        <p className="admin__message admin__message--error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.message ? (
        <p className="admin__message admin__message--ok" role="status">
          {state.message}
        </p>
      ) : null}

      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="templateKey" value={DEFAULT_TEMPLATE_KEY} />
      <input type="hidden" name="variantKey" value={selected} />

      <div className="build__styles" role="radiogroup" aria-label="Photo layout">
        {layouts.map((layout) => (
          <label
            key={layout.key}
            className="build__style"
            data-selected={layout.key === selected ? '' : undefined}
          >
            <input
              type="radio"
              name="layout"
              value={layout.key}
              checked={layout.key === selected}
              onChange={() => setSelected(layout.key)}
            />

            <span className="build__style-frame" aria-hidden="true">
              <iframe
                title={`${layout.label} preview`}
                src={`/admin/preview/${businessId}?lang=ar&variant=${layout.key}&focus=dishes`}
                width={390}
                height={620}
                loading="lazy"
                tabIndex={-1}
              />
            </span>

            <span className="build__style-name">
              {ARABIC[layout.key]?.label ?? layout.label} · {layout.label}
            </span>
            <span className="build__style-note">
              {ARABIC[layout.key]?.description ?? layout.description}
            </span>
          </label>
        ))}
      </div>

      <Apply pending={isPending} />
    </form>
  );
}

function Apply({ pending }: { pending: boolean }) {
  return (
    <div className="build__actions">
      <button type="submit" className="admin__button build__cta" disabled={pending}>
        {pending ? 'Saving…' : 'حفظ شكل العرض · Save layout'}
      </button>
    </div>
  );
}
