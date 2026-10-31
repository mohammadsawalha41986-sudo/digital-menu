'use client';

import { startTransition, useActionState, useState } from 'react';
import type { ActionState } from '@/server/admin/actions';
import { SECTION_STYLES, resolveSectionLayout, type SectionStyle } from '@/templates/street-food/sabah/section-layout';

const LABELS: Record<SectionStyle, { ar: string; en: string; hint: string }> = {
  auto: { ar: 'تلقائي', en: 'Auto', hint: 'يملأ السطر حسب عدد الأطباق · fills the row by count' },
  grid: { ar: 'بطاقات', en: 'Cards', hint: 'صورة فوق الاسم والسعر · photo cards in a grid' },
  large: { ar: 'صور كبيرة', en: 'Large photos', hint: 'طبقان في السطر بصور كبيرة · two big photos a row' },
  list: { ar: 'قائمة', en: 'List', hint: 'صورة صغيرة بجانب الاسم · small photo beside the name' },
  carousel: { ar: 'شريط سحب', en: 'Slider', hint: 'تسحب الأطباق يميناً ويساراً · swipe sideways' },
  featured: { ar: 'طبق مميز أولاً', en: 'Featured first', hint: 'أول طبق عريض والباقي تحته · first dish wide' },
};

interface Section {
  id: string;
  name: string;
  nameEn: string | null;
  dishes: number;
  active: boolean;
  style: SectionStyle;
}

export function SectionsForm({
  sections,
  action,
}: {
  sections: Section[];
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, submit, isPending] = useActionState<ActionState, FormData>(action, {});
  const [styles, setStyles] = useState<Record<string, SectionStyle>>(() =>
    Object.fromEntries(sections.map((section) => [section.id, section.style])),
  );

  return (
    <form
      // Submitted by hand: an action-bound form is reset by React after
      // saving, which would show the previous layouts again.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => submit(data));
      }}
      className="admin__panel sections"
    >
      <ul className="sections__list">
        {sections.map((section) => {
          const style = styles[section.id] ?? 'auto';
          return (
            <li key={section.id} className="sections__row" data-section-row={section.id}>
              <div className="sections__name">
                <strong>{section.name}</strong>
                <span className="admin__hint">
                  {section.nameEn ? `${section.nameEn} · ` : ''}
                  {section.dishes} {section.dishes === 1 ? 'dish' : 'dishes'}
                  {section.active ? '' : ' · مخفي · hidden'}
                </span>
              </div>
              <label className="sections__pick">
                <span className="admin__visually-hidden">شكل العرض · Layout</span>
                <select
                  name={`style:${section.id}`}
                  value={style}
                  onChange={(event) =>
                    setStyles((current) => ({ ...current, [section.id]: event.target.value as SectionStyle }))
                  }
                  className="admin__select"
                  aria-label={`${section.name} — شكل العرض · layout`}
                >
                  {SECTION_STYLES.map((option) => (
                    <option key={option} value={option}>
                      {LABELS[option].ar} · {LABELS[option].en}
                    </option>
                  ))}
                </select>
                <span className="admin__hint">{LABELS[style].hint}</span>
              </label>
              <Sketch style={style} count={section.dishes} />
            </li>
          );
        })}
      </ul>

      <div className="sections__footer">
        <button type="submit" className="admin__button" disabled={isPending}>
          {isPending ? '…' : 'حفظ · Save'}
        </button>
        {state.error ? (
          <span className="admin__message admin__message--error" role="alert">
            {state.error}
          </span>
        ) : state.ok ? (
          <span className="admin__hint" role="status">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/**
 * A thumbnail of what the menu will draw, from the same rules the menu uses:
 * boxes stand for dishes (up to six), as they sit on a wide screen.
 */
function Sketch({ style, count }: { style: SectionStyle; count: number }) {
  const shown = Math.max(1, Math.min(count, 6));
  const layout = resolveSectionLayout(style, 'grid', shown);
  const columnsFor = (n: number) => Math.min(Math.max(n, 1), 4);

  const run = (kind: 'grid' | 'large', n: number, offset: number) => (
    <div
      className={`sections__run sections__run--${kind}`}
      style={{ gridTemplateColumns: `repeat(${kind === 'large' ? Math.min(n, 2) : columnsFor(n)}, 1fr)` }}
    >
      {Array.from({ length: n }, (_, index) => (
        <span key={offset + index} />
      ))}
    </div>
  );

  return (
    <div className={`sections__sketch sections__sketch--${layout.kind}`} aria-hidden="true">
      {layout.kind === 'featured' ? (
        <>
          <span className="sections__wide" />
          {layout.rest ? run(layout.rest.kind, shown - 1, 1) : null}
        </>
      ) : layout.kind === 'grid' || layout.kind === 'large' ? (
        run(layout.kind, shown, 0)
      ) : (
        <div className={`sections__run sections__run--${layout.kind}`}>
          {Array.from({ length: shown }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      )}
    </div>
  );
}
