'use client';

import { startTransition, useActionState, useState } from 'react';
import type { ActionState } from '@/server/admin/actions';

export interface ManagerRow {
  itemCode: string;
  nameAr: string;
  section: string;
  price: string;
  sale: string;
  percent: string;
  stateLabel: string;
  state: string;
  window: string;
  branches: string;
  enabled: boolean;
  rank: number;
  hasRule: boolean;
}

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

interface Props {
  rows: ManagerRow[];
  currency: string;
  zone: string;
  branches: { key: string; nameAr: string }[];
  sort: string;
  sorts: { value: string; label: string }[];
  includesOptions: boolean;
  actions: { setEnabled: Action; applyBulk: Action; saveSettings: Action };
}

const MODES = [
  { value: 'PERCENT', label: 'نسبة % · Percent' },
  { value: 'AMOUNT', label: 'مبلغ ثابت يُخصم · Amount off' },
  { value: 'PRICE', label: 'السعر النهائي · Final price' },
];

/** Form actions go through a transition so React keeps the screen as typed. */
const send = (action: (data: FormData) => void) => (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
  startTransition(() => action(data));
};

function Message({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p className="admin__message admin__message--error" role="alert">
        {state.error}
      </p>
    );
  }
  return state.ok && state.message ? (
    <p className="admin__hint" role="status">
      {state.message}
    </p>
  ) : null;
}

export function DiscountsManager({ rows, currency, zone, branches, sort, sorts, includesOptions, actions }: Props) {
  const [settings, saveSettings, savingSettings] = useActionState(actions.saveSettings, {});
  const [bulk, applyBulk, applying] = useActionState(actions.applyBulk, {});
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [ranks, setRanks] = useState<Record<string, number>>(() => Object.fromEntries(rows.map((row) => [row.itemCode, row.rank])));
  const [currentSort, setCurrentSort] = useState(sort);
  const [mode, setMode] = useState('PERCENT');

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.itemCode));
  const toggleOne = (code: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  // The manual order: the codes as the ranks put them, ties kept in menu order.
  const orderCodes = () =>
    rows
      .map((row, index) => ({ code: row.itemCode, key: ranks[row.itemCode] ?? row.rank, index }))
      .sort((a, b) => a.key - b.key || a.index - b.index)
      .map((entry) => entry.code)
      .join(',');

  return (
    <>
      <section className="admin__panel" aria-label="Offers settings">
        <h2 className="admin__panel-title">قسم «العروض والتوفير» · Offers section</h2>
        <p className="admin__hint">
          يظهر القسم تلقائياً عند وجود أصناف بخصم نشط، ويختفي عند عدم وجودها. · The section appears by itself while any dish
          has a live discount, and disappears when none does.
        </p>
        <form onSubmit={send(saveSettings)} className="admin__grid">
          <input type="hidden" name="order" value={orderCodes()} />
          <label className="admin__field">
            <span>الترتيب · Order</span>
            <select
              name="sort"
              className="admin__select"
              value={currentSort}
              onChange={(event) => setCurrentSort(event.target.value)}
            >
              {sorts.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="options__check">
            <input type="checkbox" name="includesOptions" defaultChecked={includesOptions} />
            تطبيق النسبة على الإضافات والخيارات المدفوعة أيضاً · Apply a % discount to paid options too
          </label>
          <div className="build__actions">
            <button type="submit" className="admin__button" disabled={savingSettings}>
              حفظ · Save
            </button>
            <Message state={settings} />
          </div>
        </form>
        {currentSort === 'MANUAL' ? (
          <p className="admin__hint">
            الأرقام في عمود «ترتيب» تحدد الموقع في القسم (الأصغر أولاً)، ثم اضغط حفظ. · The rank column sets the position
            (smallest first); press Save to apply it.
          </p>
        ) : null}
      </section>

      <section className="admin__panel" aria-label="Discounts">
        <h2 className="admin__panel-title">الخصومات حسب الصنف · Dish discounts</h2>

        <form id="bulk-discount" onSubmit={send(applyBulk)} className="options__rules" aria-label="Apply to selected dishes">
          <p className="admin__hint">
            حدد أصنافاً من الجدول ثم طبّق الخصم عليها دفعة واحدة. إن كان أحدها لا يقبل الخصم لن يُحفظ أي شيء. · Tick dishes
            below, then apply one discount to all of them. If any dish cannot take it, nothing is saved.
          </p>
          <label className="options__check">
            <input type="checkbox" name="enabled" defaultChecked />
            تفعيل الخصم · Discount on
          </label>
          <label className="admin__field">
            <span>نوع الخصم · Type</span>
            <select name="mode" className="admin__select" value={mode} onChange={(event) => setMode(event.target.value)}>
              {MODES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin__field">
            <span>
              {mode === 'PERCENT' ? 'النسبة % · Percent' : `المبلغ (${currency}) · Amount (${currency})`}
            </span>
            <input name="value" className="admin__input" dir="ltr" inputMode="decimal" required />
          </label>
          <label className="admin__field">
            <span>يبدأ · Starts ({zone})</span>
            <input name="startsAt" type="datetime-local" className="admin__input" />
          </label>
          <label className="admin__field">
            <span>ينتهي · Ends ({zone})</span>
            <input name="endsAt" type="datetime-local" className="admin__input" />
          </label>
          <fieldset className="options__dishes">
            <legend>الفروع · Branches (فارغ = كل الفروع · empty = all)</legend>
            {branches.length === 0 ? <p className="admin__hint">لا توجد فروع · No branches</p> : null}
            {branches.map((branch) => (
              <label key={branch.key} className="options__check">
                <input type="checkbox" name="branchKeys" value={branch.key} />
                {branch.nameAr}
              </label>
            ))}
          </fieldset>
          <div className="build__actions">
            <button type="submit" className="admin__button" disabled={applying || selected.size === 0}>
              تطبيق على {selected.size} · Apply to {selected.size}
            </button>
            <Message state={bulk} />
          </div>
        </form>

        {rows.length === 0 ? (
          <p className="admin__empty">لا توجد أصناف في هذه المجموعة. · No dishes in this view.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="تحديد الكل · Select all"
                      checked={allSelected}
                      onChange={(event) =>
                        setSelected(event.target.checked ? new Set(rows.map((row) => row.itemCode)) : new Set())
                      }
                    />
                  </th>
                  <th>الصنف · Dish</th>
                  <th>السعر · Price</th>
                  <th>بعد الخصم · Sale</th>
                  <th>% </th>
                  <th>الحالة · Status</th>
                  <th>المدة · Window</th>
                  <th>الفروع · Branches</th>
                  <th>ترتيب · Rank</th>
                  <th>تشغيل · On/off</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.itemCode} data-discount-row={row.itemCode} data-state={row.state}>
                    <td>
                      <input
                        type="checkbox"
                        name="itemCodes"
                        value={row.itemCode}
                        form="bulk-discount"
                        aria-label={`تحديد ${row.nameAr}`}
                        checked={selected.has(row.itemCode)}
                        onChange={() => toggleOne(row.itemCode)}
                      />
                    </td>
                    <td>
                      <strong>{row.nameAr}</strong>
                      <br />
                      <span className="admin__hint">{row.section}</span>
                    </td>
                    <td className="admin__numeric">{row.price}</td>
                    <td className="admin__numeric">{row.sale}</td>
                    <td className="admin__numeric">{row.percent}</td>
                    <td>{row.stateLabel}</td>
                    <td className="admin__numeric">{row.window}</td>
                    <td>{row.branches}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        className="admin__input options__max"
                        aria-label={`ترتيب ${row.nameAr}`}
                        value={ranks[row.itemCode] ?? 0}
                        onChange={(event) =>
                          setRanks((current) => ({ ...current, [row.itemCode]: Number(event.target.value) || 0 }))
                        }
                      />
                    </td>
                    <td>
                      <RowToggle row={row} action={actions.setEnabled} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function RowToggle({ row, action }: { row: ManagerRow; action: Action }) {
  const [state, submit, pending] = useActionState(action, {});
  if (!row.hasRule) return <span className="admin__hint">أضفه من الصنف · set it on the dish</span>;
  return (
    <form onSubmit={send(submit)}>
      <input type="hidden" name="itemCode" value={row.itemCode} />
      <input type="hidden" name="enabled" value={row.enabled ? 'false' : 'true'} />
      <button type="submit" className="admin__button admin__button--small admin__button--secondary" disabled={pending}>
        {row.enabled ? 'إيقاف · Turn off' : 'تفعيل · Turn on'}
      </button>
      {state.error ? (
        <span className="admin__message admin__message--error" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
