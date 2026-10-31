'use client';

import { useEffect, useState, type RefObject } from 'react';
import { parsePriceToMinor, formatMinorAsDecimal } from '@/lib/money';
import { percentOff, salePrice, type DiscountMode } from '@/lib/discount';

/**
 * The discount panel inside the dish card. Its fields post with the dish, so
 * "Save dish" saves both. As the owner types, the panel shows the price after
 * the discount and the saving, or the percentage a final price works out to.
 */

export interface DishDiscountValues {
  discountEnabled: boolean;
  discountMode: string;
  discountValue: string;
  discountStartsAt: string;
  discountEndsAt: string;
  discountBranchKeys: string[];
}

const MODES: { value: DiscountMode; ar: string; en: string }[] = [
  { value: 'PERCENT', ar: 'نسبة %', en: 'Percent off' },
  { value: 'AMOUNT', ar: 'مبلغ ثابت يُخصم', en: 'Amount off' },
  { value: 'PRICE', ar: 'السعر النهائي', en: 'Final price' },
];

export function DishDiscount({
  formRef,
  currency,
  branches,
  zone,
  price,
  value,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  currency: string;
  branches: { key: string; nameAr: string }[];
  zone: string;
  /** The dish price as the form starts with it; the form's live value follows. */
  price: string;
  value: DishDiscountValues;
}) {
  const [enabled, setEnabled] = useState(value.discountEnabled);
  const [mode, setMode] = useState<DiscountMode>(
    MODES.some((option) => option.value === value.discountMode) ? (value.discountMode as DiscountMode) : 'PERCENT',
  );
  const [amount, setAmount] = useState(value.discountValue);
  // The price lives in the dish form: follow it as the owner types there.
  const [priceText, setPriceText] = useState(price);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const follow = () => {
      const field = form.elements.namedItem('price') as HTMLInputElement | null;
      setPriceText(field?.value ?? '');
    };
    form.addEventListener('input', follow);
    return () => form.removeEventListener('input', follow);
  }, [formRef]);

  const base = parsePriceToMinor(priceText, currency);
  const typed =
    mode === 'PERCENT'
      ? /^\d{1,2}$/.test(amount.trim())
        ? Number(amount.trim())
        : null
      : (parsePriceToMinor(amount.trim(), currency) ?? null);
  const sale = base === null || typed === null ? null : salePrice(base, mode, typed);
  const unit = currency;

  const preview =
    !amount.trim()
      ? { ar: 'اكتب الخصم لترى السعر بعد الخصم', en: 'Enter the discount to see the new price' }
      : base === null
        ? { ar: 'أدخل سعر الصنف أولاً', en: 'Enter the dish price first' }
        : sale === null
          ? { ar: 'قيمة غير صالحة: لا يصل السعر إلى صفر ولا يتجاوز السعر الأصلي', en: 'Not a valid discount for this price' }
          : {
              ar: `بعد الخصم ${formatMinorAsDecimal(sale, unit)} ${unit} · خصم ${percentOff(base, sale)}% · وفّرت ${formatMinorAsDecimal(base - sale, unit)} ${unit}`,
              en: `After: ${formatMinorAsDecimal(sale, unit)} ${unit} · ${percentOff(base, sale)}% off · save ${formatMinorAsDecimal(base - sale, unit)} ${unit}`,
            };

  return (
    <fieldset className="dish-discount" aria-label="Discount" data-dish-discount="">
      <legend className="admin__label">خصم · Discount</legend>

      <label className="options__check">
        <input
          type="checkbox"
          name="discountEnabled"
          value="on"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        تفعيل خصم · Enable discount
      </label>

      <div className="admin__grid">
        <label className="admin__field">
          <span>نوع الخصم · Type</span>
          <select
            name="discountMode"
            className="admin__select"
            value={mode}
            onChange={(event) => setMode(event.target.value as DiscountMode)}
          >
            {MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.ar} · {option.en}
              </option>
            ))}
          </select>
        </label>
        <label className="admin__field">
          <span>
            {mode === 'PERCENT' ? 'النسبة % · Percent' : mode === 'AMOUNT' ? `المبلغ (${currency}) · Amount` : `السعر بعد الخصم (${currency}) · Final price`}
          </span>
          <input
            name="discountValue"
            className="admin__input"
            dir="ltr"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
      </div>

      <p className="admin__hint" aria-live="polite" data-discount-preview={sale === null ? '' : sale}>
        <span dir="rtl">{preview.ar}</span>
        <br />
        <span dir="ltr">{preview.en}</span>
      </p>

      <div className="admin__grid">
        <label className="admin__field">
          <span>يبدأ · Starts ({zone})</span>
          <input name="discountStartsAt" type="datetime-local" className="admin__input" defaultValue={value.discountStartsAt} />
        </label>
        <label className="admin__field">
          <span>ينتهي · Ends ({zone})</span>
          <input name="discountEndsAt" type="datetime-local" className="admin__input" defaultValue={value.discountEndsAt} />
        </label>
      </div>
      <span className="admin__hint">فارغ يعني دون تاريخ محدد. · Empty means no date limit.</span>

      {branches.length > 0 ? (
        <fieldset className="options__dishes">
          <legend className="admin__label">الفروع · Branches (لا شيء = كل الفروع · none = all)</legend>
          {branches.map((branch) => (
            <label key={branch.key} className="options__check">
              <input
                type="checkbox"
                name="discountBranchKeys"
                value={branch.key}
                defaultChecked={value.discountBranchKeys.includes(branch.key)}
              />
              {branch.nameAr}
            </label>
          ))}
        </fieldset>
      ) : null}
    </fieldset>
  );
}
