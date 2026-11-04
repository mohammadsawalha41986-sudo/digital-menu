import type React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth/current-user';
import { resolveTenantContext, roleAtLeast, TenantAccessError } from '@/server/tenancy/context';
import { RANGES, getCustomerDashboard, listCustomers, readRange, type CustomerDashboard } from '@/server/customers/admin';
import { formatMinorAsDecimal } from '@/lib/money';
import { whatsappChatLink } from '@/lib/customers';
import { CustomerRowActions, OffersSignupToggle, OrderStatusSelect } from './customer-controls';
import './customers.css';

export const dynamic = 'force-dynamic';

/**
 * Customers and orders for one restaurant: what was ordered from its menu,
 * who ordered, and who asked for its offers. Manager or owner only — the page
 * shows phone numbers.
 */

const TYPE_LABELS: Record<string, string> = {
  takeaway: 'سفري · Takeaway',
  dineIn: 'داخل المطعم · Dine in',
  delivery: 'توصيل · Delivery',
};

const RANGE_LABELS: Record<number, string> = { 7: 'آخر 7 أيام', 30: 'آخر 30 يوماً', 90: 'آخر 90 يوماً' };

const dateTime = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  timeZone: 'Asia/Riyadh',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});
const dateOnly = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short', year: 'numeric' });

function phoneText(phone: string): string {
  return `+${phone}`;
}

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

/** Plain statements read off the recorded orders, each with the number behind it. */
function insights(data: CustomerDashboard, money: (minor: number) => string): string[] {
  const out: string[] = [];
  const { totals } = data;
  if (totals.orders === 0) return out;
  const peakHour = [...data.byHour].sort((a, b) => b.orders - a.orders)[0];
  if (peakHour) out.push(`أكثر ساعة طلباً: ${peakHour.hour}:00 (${peakHour.orders} طلب) — وقت مناسب لإرسال العروض قبلها.`);
  const bestDay = [...data.byDay].sort((a, b) => b.salesMinor - a.salesMinor)[0];
  if (bestDay) out.push(`أعلى يوم مبيعاً: ${bestDay.day} بقيمة ${money(bestDay.salesMinor)}.`);
  const top = data.topDishes[0];
  if (top) out.push(`الصنف الأكثر طلباً: ${top.nameAr} (${top.quantity} مرة، ${percent(top.salesMinor, totals.salesMinor)} من قيمة الطلبات).`);
  if (totals.customers > 0) {
    out.push(`العملاء العائدون: ${totals.returningCustomers} من ${totals.customers} (${percent(totals.returningCustomers, totals.customers)}).`);
  }
  if (totals.cancelled > 0) out.push(`طلبات ملغاة: ${totals.cancelled} — راجع سببها مع الفريق.`);
  if (totals.customers > 0 && totals.subscribers === 0) {
    out.push('لا يوجد مشتركون بالعروض بعد: فعّل «الاشتراك بالعروض» ليظهر للعملاء في المنيو.');
  }
  return out;
}

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { businessId } = await params;
  const query = await searchParams;
  const user = await requireUser();

  const tenant = await resolveTenantContext(user, businessId);
  if (!tenant) notFound();
  if (!roleAtLeast(tenant.role, 'MANAGER')) {
    return (
      <section className="admin__panel">
        <h1 className="admin__title">العملاء والطلبات · Customers</h1>
        <p className="admin__message" role="note">
          هذه الصفحة تعرض أرقام هواتف العملاء، لذلك هي متاحة للمدير والمالك فقط. · This page shows customers’ phone
          numbers, so only a manager or the owner can open it.
        </p>
      </section>
    );
  }

  const days = readRange(query.days);
  const subscribersOnly = query.list === 'subscribers';
  const search = typeof query.q === 'string' ? query.q : '';

  const [data, customers] = await Promise.all([
    getCustomerDashboard(user, businessId, days),
    listCustomers(user, businessId, { subscribersOnly, query: search }),
  ]).catch((error) => {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  });

  const money = (minor: number) => `${formatMinorAsDecimal(minor, data.currency)} ${data.currency}`;
  const base = `/admin/businesses/${businessId}/customers`;
  const link = (patch: Record<string, string>) => {
    const next = new URLSearchParams({ days: String(days), ...(subscribersOnly ? { list: 'subscribers' } : {}), ...(search ? { q: search } : {}), ...patch });
    for (const [key, value] of [...next.entries()]) if (!value) next.delete(key);
    return `${base}?${next.toString()}`;
  };
  const maxDay = Math.max(1, ...data.byDay.map((row) => row.orders));
  const maxHour = Math.max(1, ...data.byHour.map((row) => row.orders));
  const notes = insights(data, money);

  return (
    <div className="cu">
      <header className="admin__header">
        <div>
          <h1 className="admin__title">العملاء والطلبات · Customers &amp; orders</h1>
          <p className="admin__subtitle">
            الطلبات المرسلة من المنيو عبر واتساب، ومن طلب العروض. القيم كما ظهرت للعميل عند الإرسال، والطلب الملغى لا
            يُحسب. · Orders sent from the menu by WhatsApp. Amounts are as the customer saw them; cancelled orders are
            not counted.
          </p>
        </div>
      </header>

      <nav className="admin__actions" aria-label="الفترة · Time range">
        {RANGES.map((option) => (
          <Link
            key={option}
            href={link({ days: String(option) })}
            className={`admin__button ${option === days ? '' : 'admin__button--secondary'}`}
            aria-current={option === days ? 'page' : undefined}
          >
            <bdi dir="rtl">{RANGE_LABELS[option]}</bdi> · {option} days
          </Link>
        ))}
      </nav>

      <section className="admin__cards" aria-label="ملخص · Summary">
        <Metric value={String(data.totals.orders)} label="طلبات مرسلة · Orders sent" />
        <Metric value={money(data.totals.salesMinor)} label="قيمة الطلبات · Order value" />
        <Metric value={money(data.totals.averageMinor)} label="متوسط الطلب · Average order" />
        <Metric value={String(data.totals.customers)} label="عملاء طلبوا · Customers who ordered" />
        <Metric value={percent(data.totals.returningCustomers, data.totals.customers)} label="عملاء عائدون · Returning" />
        <Metric
          value={String(data.totals.subscribers)}
          label={<><bdi dir="rtl">مشتركو العروض، {data.totals.newSubscribers} جديد</bdi> · Offers list</>}
        />
      </section>

      <section className="admin__panel cu__panel">
        <h2 className="admin__panel-title">الاشتراك بالعروض · Offers sign-up</h2>
        <p className="admin__hint">
          عند التفعيل يظهر في منيو المطعم نموذج «اشترك ليصلك جديد العروض»، ومربع اختياري في سلة الطلب. لا يُضاف للقائمة إلا
          من وافق بنفسه، ويمكن إزالة أي عميل عند طلبه. · When on, the menu shows a sign-up card and an optional box in
          the cart. Only customers who agree are added.
        </p>
        <OffersSignupToggle businessId={businessId} enabled={data.offersSignupEnabled} />
        <div className="admin__actions">
          <a className="admin__button" href={`${base}/export?scope=subscribers`}>
            تنزيل قائمة العروض (Excel/CSV) · Download offers list
          </a>
          <a className="admin__button admin__button--secondary" href={`${base}/export?scope=all`}>
            تنزيل كل العملاء · Download all customers
          </a>
        </div>
        <p className="admin__hint">
          أرسل العروض فقط لقائمة العروض. «كل العملاء» للمتابعة وخدمة الطلبات، لا للتسويق. · Send offers only to the offers
          list.
        </p>
      </section>

      {notes.length > 0 ? (
        <section className="admin__panel cu__panel" aria-labelledby="cu-notes">
          <h2 id="cu-notes" className="admin__panel-title">ملاحظات من البيانات · What the numbers say</h2>
          <ul className="cu__notes">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <p className="admin__hint">
            محسوبة من الطلبات المرسلة في آخر {days} يوم فقط؛ الطلب المرسل لا يعني أنه استُلم، فعلّم الملغى ليبقى الحساب دقيقاً.
          </p>
        </section>
      ) : null}

      <div className="cu__grid">
        <section className="admin__panel cu__panel">
          <h2 className="admin__panel-title">الأكثر طلباً · Most ordered</h2>
          {data.topDishes.length === 0 ? (
            <p className="admin__empty">لا طلبات في هذه الفترة بعد. · No orders in this period yet.</p>
          ) : (
            <div className="admin__table-scroll">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th scope="col">الصنف · Dish</th>
                    <th scope="col">الكمية · Qty</th>
                    <th scope="col">القيمة · Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topDishes.map((dish) => (
                    <tr key={dish.code} data-top-dish={dish.code}>
                      <td>{dish.nameAr}</td>
                      <td className="admin__numeric">{dish.quantity}</td>
                      <td className="admin__numeric">{money(dish.salesMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin__panel cu__panel">
          <h2 className="admin__panel-title">نوع الطلب · Order type</h2>
          {data.byType.length === 0 ? (
            <p className="admin__empty">—</p>
          ) : (
            <table className="admin__table">
              <tbody>
                {data.byType.map((row) => (
                  <tr key={row.type}>
                    <td>{TYPE_LABELS[row.type] ?? row.type}</td>
                    <td className="admin__numeric">{row.orders}</td>
                    <td className="admin__numeric">{money(row.salesMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="admin__panel cu__panel">
          <h2 className="admin__panel-title">الطلبات حسب اليوم · By day</h2>
          {data.byDay.length === 0 ? (
            <p className="admin__empty">—</p>
          ) : (
            <table className="admin__table cu__bars">
              <tbody>
                {data.byDay.map((row) => (
                  <tr key={row.day}>
                    <td dir="ltr">{row.day}</td>
                    <td className="cu__bar-cell">
                      <span className="cu__bar" style={{ inlineSize: `${(row.orders / maxDay) * 100}%` }} />
                    </td>
                    <td className="admin__numeric">{row.orders}</td>
                    <td className="admin__numeric">{money(row.salesMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="admin__panel cu__panel">
          <h2 className="admin__panel-title">الطلبات حسب الساعة · By hour</h2>
          {data.byHour.length === 0 ? (
            <p className="admin__empty">—</p>
          ) : (
            <table className="admin__table cu__bars">
              <tbody>
                {data.byHour.map((row) => (
                  <tr key={row.hour}>
                    <td dir="ltr">{String(row.hour).padStart(2, '0')}:00</td>
                    <td className="cu__bar-cell">
                      <span className="cu__bar" style={{ inlineSize: `${(row.orders / maxHour) * 100}%` }} />
                    </td>
                    <td className="admin__numeric">{row.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="admin__panel cu__panel" aria-labelledby="cu-orders">
        <h2 id="cu-orders" className="admin__panel-title">آخر الطلبات · Latest orders</h2>
        {data.recentOrders.length === 0 ? (
          <p className="admin__empty">
            لم يُرسل أي طلب من المنيو بعد. تظهر الطلبات هنا لحظة إرسالها من سلة المنيو. · No orders yet; they appear here as
            customers send them.
          </p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table cu__orders">
              <thead>
                <tr>
                  <th scope="col">الوقت · Time</th>
                  <th scope="col">العميل · Customer</th>
                  <th scope="col">النوع · Type</th>
                  <th scope="col">الأصناف · Items</th>
                  <th scope="col">القيمة · Total</th>
                  <th scope="col">الحالة · Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((order) => (
                  <tr key={order.id} data-order-row={order.id} data-status={order.status}>
                    <td>{dateTime.format(order.createdAt)}</td>
                    <td>
                      <span className="cu__who">{order.customerName ?? '—'}</span>
                      {order.customerPhone ? (
                        <a className="cu__phone" dir="ltr" href={whatsappChatLink(order.customerPhone)} target="_blank" rel="noreferrer">
                          {phoneText(order.customerPhone)}
                        </a>
                      ) : null}
                    </td>
                    <td>
                      {TYPE_LABELS[order.orderType] ?? order.orderType}
                      {order.tableNumber ? ` · ${order.tableNumber}` : ''}
                    </td>
                    <td className="cu__items">{order.items.map((item) => `${item.nameAr} ×${item.quantity}`).join('، ')}</td>
                    <td className="admin__numeric">{money(order.totalMinor)}</td>
                    <td>
                      <OrderStatusSelect businessId={businessId} orderId={order.id} status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin__panel cu__panel" aria-labelledby="cu-customers">
        <h2 id="cu-customers" className="admin__panel-title">العملاء · Customers</h2>
        <form className="cu__filters" action={base} method="get">
          <input type="hidden" name="days" value={days} />
          <label className="admin__field cu__search">
            <span className="admin__label">بحث بالاسم أو الرقم · Search</span>
            <input className="admin__input" name="q" defaultValue={search} />
          </label>
          <label className="cu__check">
            <input type="checkbox" name="list" value="subscribers" defaultChecked={subscribersOnly} />
            <span>مشتركو العروض فقط · Offers list only</span>
          </label>
          <button type="submit" className="admin__button admin__button--secondary">عرض · Show</button>
        </form>
        {customers.length === 0 ? (
          <p className="admin__empty">لا عملاء بعد. · No customers yet.</p>
        ) : (
          <div className="admin__table-scroll">
            <table className="admin__table">
              <thead>
                <tr>
                  <th scope="col">الاسم · Name</th>
                  <th scope="col">الجوال · Phone</th>
                  <th scope="col">الطلبات · Orders</th>
                  <th scope="col">المجموع · Spent</th>
                  <th scope="col">آخر طلب · Last order</th>
                  <th scope="col">العروض · Offers</th>
                  <th scope="col" aria-label="إجراءات · Actions" />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} data-customer-row={customer.phone}>
                    <td>{customer.name ?? '—'}</td>
                    <td>
                      <a className="cu__phone" dir="ltr" href={whatsappChatLink(customer.phone)} target="_blank" rel="noreferrer">
                        {phoneText(customer.phone)}
                      </a>
                    </td>
                    <td className="admin__numeric">{customer.orderCount}</td>
                    <td className="admin__numeric">{money(customer.totalSpentMinor)}</td>
                    <td>{customer.lastOrderAt ? dateOnly.format(customer.lastOrderAt) : '—'}</td>
                    <td>
                      {customer.marketingOptIn ? (
                        <span className="admin__badge admin__badge--active">مشترك · Yes</span>
                      ) : customer.optOutAt ? (
                        <span className="admin__badge admin__badge--draft" title={dateOnly.format(customer.optOutAt)}>
                          أوقفها بطلبه · Opted out
                        </span>
                      ) : (
                        <span className="admin__badge admin__badge--inactive">لا · No</span>
                      )}
                    </td>
                    <td>
                      <CustomerRowActions businessId={businessId} customerId={customer.id} subscribed={customer.marketingOptIn} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {customers.length >= 500 ? <p className="admin__hint">يظهر أحدث 500 عميل؛ استخدم البحث أو التنزيل للباقي.</p> : null}
      </section>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: React.ReactNode }) {
  return (
    <div className="admin__card">
      <span className="admin__metric">{value}</span>
      <span className="admin__metric-label">{label}</span>
    </div>
  );
}
