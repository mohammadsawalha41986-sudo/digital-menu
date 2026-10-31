import { formatMinorAsDecimal } from '@/lib/money';
import { discountState as windowState } from '@/lib/discount';
import { formatLocalDateTime } from '@/server/offers/datetime';

/**
 * The discount as the dish form shows it. Kept apart from business-service
 * so the dish page and the discount page read the same values the same way.
 */
export interface DiscountFieldValues {
  discountEnabled: boolean;
  discountMode: string;
  /** A percent as typed ("20"), or an amount / final price as a decimal. */
  discountValue: string;
  /** `datetime-local` values in the restaurant's zone; empty is open. */
  discountStartsAt: string;
  discountEndsAt: string;
  discountBranchKeys: string[];
}

export interface StoredDiscount {
  discountEnabled: boolean;
  discountMode: string | null;
  discountValue: number | null;
  discountStartsAt: Date | null;
  discountEndsAt: Date | null;
  discountBranchKeys: string[];
}

export function discountFieldValues(item: StoredDiscount, currency: string, zone: string): DiscountFieldValues {
  return {
    discountEnabled: item.discountEnabled,
    discountMode: item.discountMode ?? 'PERCENT',
    discountValue:
      item.discountValue === null
        ? ''
        : item.discountMode === 'PERCENT'
          ? String(item.discountValue)
          : formatMinorAsDecimal(item.discountValue, currency),
    discountStartsAt: formatLocalDateTime(item.discountStartsAt, zone),
    discountEndsAt: formatLocalDateTime(item.discountEndsAt, zone),
    discountBranchKeys: item.discountBranchKeys,
  };
}

/** Where a dish's discount stands at `now`, for the dish card's status line. */
export function discountStatusOf(item: StoredDiscount & { availability: string }, now = new Date()) {
  if (item.discountMode === null) return 'none' as const;
  if (item.availability === 'UNAVAILABLE') return 'unavailable' as const;
  return windowState(
    { enabled: item.discountEnabled, startsAt: item.discountStartsAt, endsAt: item.discountEndsAt },
    now,
  );
}

export const EMPTY_DISCOUNT_FIELDS: DiscountFieldValues = {
  discountEnabled: false,
  discountMode: 'PERCENT',
  discountValue: '',
  discountStartsAt: '',
  discountEndsAt: '',
  discountBranchKeys: [],
};
