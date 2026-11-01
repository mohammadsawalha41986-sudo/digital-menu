import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { getBusinessForAdmin } from '@/server/admin/business-service';
import { listDiscountHistory, listDiscounts, type DiscountRow } from '@/server/admin/discounts';
import { TenantAccessError } from '@/server/tenancy/context';
import { formatMinorAsDecimal } from '@/lib/money';
import { OFFER_SORTS } from '@/lib/discount';
import {
  applyDiscountToManyAction,
  saveOffersSettingsAction,
  setDiscountEnabledAction,
} from '@/server/admin/actions';
import { DiscountsManager, type ManagerRow } from './discounts-manager';

export const dynamic = 'force-dynamic';

const VIEWS = ['live', 'scheduled', 'expired', 'disabled', 'all'] as const;
type View = (typeof VIEWS)[number];

const STATE_LABEL: Record<DiscountRow['state'], string> = {
  live: 'نشط · Live',
  scheduled: 'مجدول · Scheduled',
  expired: 'منتهٍ · Expired',
  disabled: 'معطل · Off',
  none: '—',
};

const SORT_LABEL: Record<(typeof OFFER_SORTS)[number], string> = {
  PERCENT: 'أعلى نسبة خصم · Highest % off',
  SAVING: 'أعلى مبلغ توفير · Highest saving',
  NEWEST: 'أحدث العروض · Newest',
  ENDING: 'ينتهي قريباً أولاً · Ending soonest',
  MANUAL: 'ترتيب يدوي · Manual order',
};

/** `2026-11-01T10:00` as `2026-11-01 10:00`, or a dash. */
const when = (value: string | null) => (value ? value.replace('T', ' ') : '—');

export default async function DiscountsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { businessId } = await params;
  const { view: requested } = await searchParams;
  const user = await requireUser();

  const business = await getBusinessForAdmin(user, businessId).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const [data, history] = await Promise.all([
    listDiscounts(user, businessId),
    listDiscountHistory(user, businessId),
  ]);
  const view: View = (VIEWS as readonly string[]).includes(requested ?? '') ? (requested as View) : 'live';

  const counts = {
    live: data.rows.filter((row) => row.state === 'live').length,
    scheduled: data.rows.filter((row) => row.state === 'scheduled').length,
    expired: data.rows.filter((row) => row.state === 'expired').length,
    disabled: data.rows.filter((row) => row.state === 'disabled').length,
    all: data.rows.length,
  };

  const rows: ManagerRow[] = data.rows
    .filter((row) => view === 'all' || row.state === view)
    .map((row) => ({
      itemCode: row.itemCode,
      nameAr: row.nameAr,
      section: row.section,
      price: row.priceMinor === null ? '—' : `${formatMinorAsDecimal(row.priceMinor, data.currency)}`,
      sale: row.saleMinor === null ? '—' : `${formatMinorAsDecimal(row.saleMinor, data.currency)}`,
      percent: row.percent === null ? '—' : `${row.percent}%`,
      stateLabel: STATE_LABEL[row.state],
      state: row.state,
      window: row.mode === null ? '—' : `${when(instantIn(row.startsAt, data.zone))} → ${when(instantIn(row.endsAt, data.zone))}`,
      branches:
        row.branchKeys.length === 0
          ? 'كل الفروع · All'
          : data.branches.filter((branch) => row.branchKeys.includes(branch.key)).map((branch) => branch.nameAr).join('، '),
      enabled: row.enabled,
      rank: row.sortOrder,
      hasRule: row.mode !== null,
    }));

  const setEnabled = setDiscountEnabledAction.bind(null, business.id, business.publicId);
  const applyBulk = applyDiscountToManyAction.bind(null, business.id, business.publicId);
  const saveSettings = saveOffersSettingsAction.bind(null, business.id, business.publicId);

  return (
    <>
      <header className="admin__header">
        <div>
          <h1 className="admin__title">الخصومات والعروض · Discounts & offers</h1>
          <p className="admin__subtitle">
            أي صنف عليه خصم نشط يظهر تلقائياً في قسم «العروض والتوفير» في المنيو، وفي قسمه الأصلي أيضاً. لا تحتاج إلى
            نسخ الصنف ولا إلى نشر المنيو من جديد.
          </p>
        </div>
        <div className="admin__actions">
          <a href={`/m/${business.publicId}`} target="_blank" rel="noreferrer" className="admin__button admin__button--secondary">
            معاينة المنيو · Preview
          </a>
        </div>
      </header>

      <nav className="admin__panel" aria-label="Discount views">
        {VIEWS.map((key) => (
          <Link
            key={key}
            href={`?view=${key}`}
            className={`admin__button admin__button--small ${view === key ? '' : 'admin__button--secondary'}`}
            aria-current={view === key ? 'page' : undefined}
          >
            {VIEW_LABEL[key]} ({counts[key]})
          </Link>
        ))}
      </nav>

      <DiscountsManager
        rows={rows}
        currency={data.currency}
        zone={data.zone}
        branches={data.branches}
        sort={data.sort}
        sorts={OFFER_SORTS.map((value) => ({ value, label: SORT_LABEL[value] }))}
        includesOptions={data.includesOptions}
        actions={{ setEnabled, applyBulk, saveSettings }}
      />

      <section className="admin__panel" aria-label="Discount history">
        <h2 className="admin__panel-title">سجل التعديلات · History</h2>
        {history.length === 0 ? (
          <p className="admin__empty">لا توجد تعديلات بعد. · No changes yet.</p>
        ) : (
          <table className="admin__table">
            <thead>
              <tr>
                <th>التاريخ · When</th>
                <th>التعديل · Change</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id}>
                  <td className="admin__numeric">{entry.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</td>
                  <td>{describe(entry.action, entry.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

const VIEW_LABEL: Record<View, string> = {
  live: 'نشطة · Live',
  scheduled: 'مجدولة · Scheduled',
  expired: 'منتهية · Expired',
  disabled: 'معطلة · Off',
  all: 'الكل · All',
};

/** An instant as `YYYY-MM-DDTHH:mm` in the restaurant's zone, or null. */
function instantIn(instant: Date | null, zone: string): string | null {
  if (!instant) return null;
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(instant)
    .replace(' ', 'T');
}

function describe(action: string, metadata: unknown): string {
  const data = (metadata ?? {}) as Record<string, unknown>;
  if (action === 'offers.settings_changed') {
    return `إعدادات العروض · Offers settings — ${String(data.sort ?? '')}`;
  }
  const what = data.bulk ? `${(data.items as string[] | undefined)?.length ?? 0} أصناف` : String(data.itemCode ?? '');
  if (data.enabled === false) return `تعطيل الخصم · Discount off — ${what}`;
  return `تحديث الخصم · Discount saved — ${what}${data.mode ? ` (${String(data.mode)} ${String(data.value ?? '')})` : ''}`;
}
