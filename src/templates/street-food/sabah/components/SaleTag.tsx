'use client';

import { currencyUnit, formatAmount } from '../money';
import { urgency } from '../deals';
import { useMinute } from '../clock';
import type { MenuItem } from '../data/menuData';

/**
 * How a discount reads on a dish: a badge with the percentage (text, not
 * colour alone), the old price struck through, the saving, and — only when
 * the discount really has an end date — "ends soon" or "limited time".
 * Colours come from the restaurant's design (--brand-menu-sale).
 */

export function SaleBadge({ item, isAr, small = false }: { item: MenuItem; isAr: boolean; small?: boolean }) {
  if (!item.sale) return null;
  return (
    <span
      data-sale-badge={item.sale.percent}
      className={`sf-sale-badge ${small ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2.5 py-1'} font-black rounded-lg shadow-md shrink-0`}
    >
      {isAr ? `خصم ${item.sale.percent}%` : `${item.sale.percent}% off`}
    </span>
  );
}

export function SaleUrgency({ item, isAr }: { item: MenuItem; isAr: boolean }) {
  const minute = useMinute();
  const kind = urgency(item, minute === null ? null : minute * 60_000);
  if (!kind) return null;
  return (
    <span data-sale-urgency={kind} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-950/85 text-amber-200 border border-amber-500/40 shrink-0">
      {kind === 'ending' ? (isAr ? 'ينتهي قريباً' : 'Ends soon') : isAr ? 'عرض لفترة محدودة' : 'Limited time'}
    </span>
  );
}

/** The struck-through original price and the saving, beside the sale price. */
export function SaleWas({ item, isAr, currency, showSaving = true }: { item: MenuItem; isAr: boolean; currency: string; showSaving?: boolean }) {
  if (!item.sale) return null;
  const unit = currencyUnit(currency, isAr);
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] leading-tight">
      <s className="text-stone-400 tabular-nums" data-sale-was>
        <span className="sr-only">{isAr ? 'السعر قبل الخصم ' : 'Was '}</span>
        {formatAmount(item.sale.originalPrice, currency)} {unit}
      </s>
      {showSaving ? (
        <span className="sf-sale-text font-bold" data-sale-saving>
          {isAr ? `وفّر ${formatAmount(item.sale.saving, currency)} ${unit}` : `Save ${formatAmount(item.sale.saving, currency)} ${unit}`}
        </span>
      ) : null}
    </span>
  );
}
