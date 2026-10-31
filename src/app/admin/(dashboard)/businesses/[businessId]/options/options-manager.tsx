'use client';

import { startTransition, useActionState, useEffect, useState } from 'react';
import type { ActionState } from '@/server/admin/actions';

interface Option {
  key?: string;
  nameAr: string;
  nameEn: string;
  price: string;
  isDefault: boolean;
}

interface Group {
  key?: string;
  nameAr: string;
  nameEn: string;
  required: boolean;
  max: number;
  options: Option[];
  items: string[];
}

interface Section {
  key: string;
  name: string;
  dishes: { code: string; name: string }[];
}

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Starting points for the groups restaurants make most. */
const PRESETS: { label: string; hint: string; group: Group }[] = [
  {
    label: 'الحجم',
    hint: 'وسط / كبير بسعر مختلف',
    group: {
      nameAr: 'الحجم',
      nameEn: 'Size',
      required: true,
      max: 1,
      options: [
        { nameAr: 'وسط', nameEn: 'Medium', price: '', isDefault: true },
        { nameAr: 'كبير', nameEn: 'Large', price: '', isDefault: false },
      ],
      items: [],
    },
  },
  {
    label: 'اختيار إجباري',
    hint: 'مثل نوع الرز مع الوجبة',
    group: {
      nameAr: 'نوع الرز',
      nameEn: 'Rice',
      required: true,
      max: 1,
      options: [
        { nameAr: 'رز أبيض', nameEn: 'White rice', price: '', isDefault: false },
        { nameAr: 'رز مندي', nameEn: 'Mandi rice', price: '', isDefault: false },
      ],
      items: [],
    },
  },
  {
    label: 'إضافات',
    hint: 'جبنة، صوص… يختار أكثر من واحد',
    group: {
      nameAr: 'إضافات',
      nameEn: 'Extras',
      required: false,
      max: 3,
      options: [
        { nameAr: 'جبنة', nameEn: 'Cheese', price: '', isDefault: false },
        { nameAr: 'ثومية', nameEn: 'Garlic sauce', price: '', isDefault: false },
      ],
      items: [],
    },
  },
  {
    label: 'استبدال',
    hint: 'مثل رز بدل البطاطا',
    group: {
      nameAr: 'استبدال',
      nameEn: 'Swap',
      required: false,
      max: 1,
      options: [{ nameAr: 'رز بدل البطاطا', nameEn: 'Rice instead of fries', price: '', isDefault: false }],
      items: [],
    },
  },
];

const BLANK_OPTION: Option = { nameAr: '', nameEn: '', price: '', isDefault: false };

export function OptionsManager({
  currency,
  sections,
  groups,
  saveAction,
  deleteAction,
}: {
  currency: string;
  sections: Section[];
  groups: Group[];
  saveAction: Action;
  deleteAction: Action;
}) {
  // The group open in the editor: an existing one (by key) or a new draft.
  const [editing, setEditing] = useState<{ group: Group; isNew: boolean } | null>(null);
  const [deleteState, remove, deleting] = useActionState<ActionState, FormData>(deleteAction, {});
  const dishName = new Map(sections.flatMap((section) => section.dishes.map((dish) => [dish.code, dish.name])));

  return (
    <>
      <section className="admin__panel">
        <h2 className="admin__panel-title">مجموعة جديدة · New group</h2>
        <div className="options__presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="options__preset"
              onClick={() => setEditing({ group: structuredClone(preset.group), isNew: true })}
            >
              <strong>{preset.label}</strong>
              <span>{preset.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {editing ? (
        <Editor
          key={editing.group.key ?? 'new'}
          initial={editing.group}
          isNew={editing.isNew}
          currency={currency}
          sections={sections}
          action={saveAction}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <section className="admin__panel">
        <h2 className="admin__panel-title">المجموعات · Groups ({groups.length})</h2>
        {deleteState.error ? (
          <p className="admin__message admin__message--error" role="alert">
            {deleteState.error}
          </p>
        ) : null}
        {groups.length === 0 ? (
          <p className="admin__empty">لا توجد مجموعات بعد. ابدأ من أحد الأشكال بالأعلى.</p>
        ) : (
          <ul className="options__list">
            {groups.map((group) => (
              <li key={group.key} className="options__group" data-option-group={group.nameAr}>
                <div className="options__group-head">
                  <strong>{group.nameAr}</strong>
                  <span className="admin__hint">{rule(group)}</span>
                </div>
                <p className="options__chips">
                  {group.options.map((option) => (
                    <span key={option.key} className="options__chip">
                      {option.nameAr}
                      {option.price ? ` +${option.price}` : ''}
                    </span>
                  ))}
                </p>
                <p className="admin__hint">
                  {group.items.length === 0
                    ? 'ليست على أي طبق بعد · on no dish yet'
                    : `على ${group.items.length} ${group.items.length === 1 ? 'طبق' : 'أطباق'}: ` +
                      group.items
                        .slice(0, 4)
                        .map((code) => dishName.get(code) ?? code)
                        .join('، ') +
                      (group.items.length > 4 ? '…' : '')}
                </p>
                <div className="options__group-actions">
                  <button
                    type="button"
                    className="admin__button admin__button--small"
                    onClick={() => setEditing({ group: structuredClone(group), isNew: false })}
                  >
                    تعديل · Edit
                  </button>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!window.confirm(`حذف «${group.nameAr}» من كل الأطباق؟`)) return;
                      const data = new FormData(event.currentTarget);
                      startTransition(() => remove(data));
                    }}
                  >
                    <input type="hidden" name="key" value={group.key} />
                    <button type="submit" className="admin__button admin__button--small admin__button--danger" disabled={deleting}>
                      حذف · Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function rule(group: Group) {
  const pick = group.max === 1 ? 'اختيار واحد' : `حتى ${group.max} اختيارات`;
  return `${group.required ? 'إجباري' : 'اختياري'} · ${pick}`;
}

function Editor({
  initial,
  isNew,
  currency,
  sections,
  action,
  onClose,
}: {
  initial: Group;
  isNew: boolean;
  currency: string;
  sections: Section[];
  action: Action;
  onClose: () => void;
}) {
  const [group, setGroup] = useState<Group>(initial);
  const [state, submit, isPending] = useActionState<ActionState, FormData>(action, {});
  const single = group.max === 1;
  // A new group, once saved, appears in the list below; closing the draft
  // keeps a second save from creating it twice.
  useEffect(() => {
    if (state.ok && isNew) onClose();
  }, [state, isNew, onClose]);
  const update = (patch: Partial<Group>) => setGroup((current) => ({ ...current, ...patch }));
  const setOption = (index: number, patch: Partial<Option>) =>
    update({
      options: group.options.map((option, at) => {
        if (at === index) return { ...option, ...patch };
        // A single choice has one default: picking one clears the others.
        return patch.isDefault && single ? { ...option, isDefault: false } : option;
      }),
    });
  const toggleDishes = (codes: string[], on: boolean) =>
    update({
      items: on
        ? Array.from(new Set([...group.items, ...codes]))
        : group.items.filter((code) => !codes.includes(code)),
    });

  return (
    <section className="admin__panel options__editor" aria-label="Group editor">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData();
          data.set('group', JSON.stringify(group));
          startTransition(() => submit(data));
        }}
      >
        <h2 className="admin__panel-title">{isNew ? 'مجموعة جديدة' : `تعديل «${initial.nameAr}»`}</h2>

        <div className="options__names">
          <label className="admin__field">
            <span>الاسم · Name (AR)</span>
            <input className="admin__input" value={group.nameAr} onChange={(event) => update({ nameAr: event.target.value })} required />
          </label>
          <label className="admin__field">
            <span>Name (EN)</span>
            <input className="admin__input" dir="ltr" value={group.nameEn} onChange={(event) => update({ nameEn: event.target.value })} />
          </label>
        </div>

        <div className="options__rules">
          <label className="options__check">
            <input type="checkbox" checked={group.required} onChange={(event) => update({ required: event.target.checked })} />
            إجباري — لا يُضاف الطبق للطلب قبل الاختيار · Required
          </label>
          <label className="options__check">
            <input type="radio" name="pick" checked={single} onChange={() => update({ max: 1 })} />
            اختيار واحد فقط · One choice
          </label>
          <label className="options__check">
            <input type="radio" name="pick" checked={!single} onChange={() => update({ max: Math.max(2, group.options.length) })} />
            أكثر من اختيار، حتى
            <input
              type="number"
              min={2}
              className="admin__input options__max"
              value={single ? 2 : group.max}
              disabled={single}
              onChange={(event) => update({ max: Math.max(2, Number(event.target.value) || 2) })}
              aria-label="Up to"
            />
          </label>
        </div>

        <fieldset className="options__rows">
          <legend>الخيارات · Options</legend>
          <p className="admin__hint">
            السعر هو الزيادة على سعر الطبق ({currency}). اتركه فارغاً إذا كان مجانياً. مثال: الطبق 15 والكبير +5 = 20.
          </p>
          {group.options.map((option, index) => (
            <div key={index} className="options__row" data-option-row>
              <input
                className="admin__input"
                placeholder="الاسم بالعربي"
                aria-label={`خيار ${index + 1} — الاسم`}
                value={option.nameAr}
                onChange={(event) => setOption(index, { nameAr: event.target.value })}
              />
              <input
                className="admin__input"
                dir="ltr"
                placeholder="English"
                aria-label={`Option ${index + 1} — English`}
                value={option.nameEn}
                onChange={(event) => setOption(index, { nameEn: event.target.value })}
              />
              <input
                className="admin__input options__price"
                inputMode="decimal"
                dir="ltr"
                placeholder="+0"
                aria-label={`خيار ${index + 1} — السعر`}
                value={option.price}
                onChange={(event) => setOption(index, { price: event.target.value })}
              />
              <label className="options__check options__default">
                <input
                  type="checkbox"
                  checked={option.isDefault}
                  onChange={(event) => setOption(index, { isDefault: event.target.checked })}
                />
                مختار مسبقاً
              </label>
              <button
                type="button"
                className="admin__button admin__button--small admin__button--secondary"
                aria-label={`حذف الخيار ${index + 1}`}
                onClick={() => update({ options: group.options.filter((_, at) => at !== index) })}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="admin__button admin__button--small admin__button--secondary"
            onClick={() => update({ options: [...group.options, { ...BLANK_OPTION }] })}
          >
            + خيار · Add option
          </button>
        </fieldset>

        <fieldset className="options__dishes">
          <legend>على أي أطباق؟ · On which dishes? ({group.items.length})</legend>
          {sections.map((section) => {
            const codes = section.dishes.map((dish) => dish.code);
            const all = codes.every((code) => group.items.includes(code));
            return (
              <div key={section.key} className="options__section">
                <label className="options__check options__section-all">
                  <input type="checkbox" checked={all} onChange={(event) => toggleDishes(codes, event.target.checked)} />
                  <strong>{section.name}</strong> — كل القسم
                </label>
                <div className="options__dish-list">
                  {section.dishes.map((dish) => (
                    <label key={dish.code} className="options__check">
                      <input
                        type="checkbox"
                        checked={group.items.includes(dish.code)}
                        onChange={(event) => toggleDishes([dish.code], event.target.checked)}
                      />
                      {dish.name}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </fieldset>

        <div className="options__footer">
          <button type="submit" className="admin__button" disabled={isPending}>
            {isPending ? '…' : 'حفظ · Save'}
          </button>
          <button type="button" className="admin__button admin__button--secondary" onClick={onClose}>
            إغلاق · Close
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
    </section>
  );
}
