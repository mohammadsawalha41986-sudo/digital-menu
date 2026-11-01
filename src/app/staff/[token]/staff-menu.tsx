'use client';

import { useActionState, useMemo, useState } from 'react';
import { setStaffAvailabilityAction, type StaffState } from './actions';
import './staff.css';

export interface StaffMenuProps {
  token: string;
  label: string;
  businessName: string;
  sections: {
    key: string;
    nameAr: string;
    nameEn: string;
    items: { itemCode: string; nameAr: string; nameEn: string; availability: string }[];
  }[];
}

const CHOICES = [
  { status: 'AVAILABLE', ar: 'متوفر', en: 'Available' },
  { status: 'UNAVAILABLE', ar: 'غير متوفر الآن', en: 'Out right now' },
  { status: 'HIDDEN', ar: 'مخفي من المنيو', en: 'Hidden from menu' },
] as const;

/**
 * The staff page: every dish, its state, and three buttons to change it.
 * Each dish has its own form, so one change never waits on another.
 */
export function StaffMenu({ token, label, businessName, sections }: StaffMenuProps) {
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const all = sections.flatMap((section) => section.items);
    return {
      available: all.filter((item) => item.availability === 'AVAILABLE').length,
      out: all.filter((item) => item.availability === 'UNAVAILABLE').length,
      hidden: all.filter((item) => item.availability === 'HIDDEN').length,
    };
  }, [sections]);

  const needle = query.trim().toLowerCase();

  return (
    <main className="staff" dir="auto">
      <header className="staff__header">
        <div>
          <p className="staff__eyebrow">{label}</p>
          <h1 className="staff__title">{businessName}</h1>
        </div>
        <dl className="staff__counts" aria-label="Summary">
          <div><dt>متوفر · Available</dt><dd>{counts.available}</dd></div>
          <div><dt>غير متوفر · Out</dt><dd>{counts.out}</dd></div>
          <div><dt>مخفي · Hidden</dt><dd>{counts.hidden}</dd></div>
        </dl>
      </header>

      <div className="staff__search">
        <label htmlFor="staff-search" className="staff__search-label">
          ابحث عن صنف · Find a dish
        </label>
        <input
          id="staff-search"
          type="search"
          className="staff__search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="الاسم أو الاسم بالإنجليزية · Name"
        />
      </div>

      {sections.map((section) => {
        const items = section.items.filter(
          (item) =>
            needle === '' ||
            item.nameAr.toLowerCase().includes(needle) ||
            item.nameEn.toLowerCase().includes(needle),
        );
        if (items.length === 0) return null;

        return (
          <section key={section.key} className="staff__section" aria-labelledby={`sec-${section.key}`}>
            <h2 id={`sec-${section.key}`} className="staff__section-title">
              {section.nameAr} <span>· {section.nameEn}</span>
            </h2>
            <ul className="staff__list">
              {items.map((item) => (
                <DishRow key={item.itemCode} token={token} item={item} />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="staff__footnote">
        التغيير يظهر في المنيو فوراً · Changes show on the menu straight away.
      </p>
    </main>
  );
}

function DishRow({
  token,
  item,
}: {
  token: string;
  item: { itemCode: string; nameAr: string; nameEn: string; availability: string };
}) {
  const [state, formAction, pending] = useActionState<StaffState, FormData>(setStaffAvailabilityAction, {});
  const locked = item.availability === 'SEASONAL';

  return (
    <li className="staff__row" data-item={item.itemCode} data-availability={item.availability}>
      <div className="staff__names">
        <span className="staff__name-ar">{item.nameAr}</span>
        {item.nameEn && item.nameEn !== item.nameAr ? (
          <span className="staff__name-en">{item.nameEn}</span>
        ) : null}
      </div>

      {locked ? (
        <p className="staff__locked">موسمي: يحدده صاحب المطعم · Seasonal: set by the owner</p>
      ) : (
        <form action={formAction} className="staff__choices" aria-label={`${item.nameEn || item.nameAr}`}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="itemCode" value={item.itemCode} />
          {CHOICES.map((choice) => {
            const current = item.availability === choice.status;
            return (
              <button
                key={choice.status}
                type="submit"
                name="status"
                value={choice.status}
                disabled={pending || current}
                aria-pressed={current}
                className={`staff__choice staff__choice--${choice.status.toLowerCase()}${current ? ' is-current' : ''}`}
              >
                <span className="staff__choice-ar">{choice.ar}</span>
                <span className="staff__choice-en">{choice.en}</span>
              </button>
            );
          })}
        </form>
      )}

      {state.error ? (
        <p className="staff__error" role="alert">{state.error}</p>
      ) : state.ok && state.message ? (
        <p className="staff__saved" role="status">{state.message}</p>
      ) : null}
    </li>
  );
}
