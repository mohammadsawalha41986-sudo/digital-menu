'use client';

import { useEffect, useState, type RefObject } from 'react';
import { parsePriceToMinor, formatMinorAsDecimal } from '@/lib/money';
import { parsePercent, percentOff, salePrice, type DiscountMode } from '@/lib/discount';

/**
 * The discount panel inside the dish card. Its fields post with the dish, so
 * "Save dish" saves both. As the owner types, the panel shows the price after
 * the discount and the saving, or the percentage a final price works out to.
 */

/** Where the discount stands now, worked out on the server from its window. */
export type DishDiscountStatus = 'none' | 'live' | 'scheduled' | 'expired' | 'disabled' | 'unavailable';

const STATUS_TEXT: Record<DishDiscountStatus, { ar: string; en: string }> = {
  none: { ar: 'لا يوجد خصم على هذا الصنف بعد', en: 'No discount on this dish yet' },
  live: { ar: 'نشط الآن: يظهر للعملاء في العروض والتوفير', en: 'Live now: customers see it in the offers' },
  scheduled: { ar: 'مجدول: يبدأ في الموعد المحدد ثم يظهر', en: 'Scheduled: it shows from its start time' },
  expired: { ar: 'منتهٍ: لن يظهر للعملاء', en: 'Ended: customers do not see it' },
  disabled: { ar: 'معطّل: لن يظهر للعملاء', en: 'Off: customers do not see it' },
  unavailable: { ar: 'الصنف غير متوفر: لا يظهر الخصم', en: 'Dish unavailable: the discount is not shown' },
};

export interface DishDiscountValues {
  discountState: DishDiscountStatus;
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
  // "20", "20%" and Arabic digits all read as 20, the same as the server.
  const typed = mode === 'PERCENT' ? parsePercent(amount) : (parsePriceToMinor(amount.trim(), currency) ?? null);
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
      <p className="admin__hint" data-discount-status={value.discountState}>
        <span dir="rtl">{STATUS_TEXT[value.discountState].ar}</span>
        {' · '}
        <span dir="ltr">{STATUS_TEXT[value.discountState].en}</span>
      </p>

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
            // Required while the discount is on: an empty value is refused by the
            // browser, in front of the field, instead of being saved as nothing.
            required={enabled}
            pattern={mode === 'PERCENT' ? '\\s*[0-9٠-٩]{1,2}\\s*[%٪]?\\s*' : undefined}
            title={mode === 'PERCENT' ? 'اكتب نسبة من 1 إلى 95 · a whole percentage from 1 to 95' : undefined}
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
