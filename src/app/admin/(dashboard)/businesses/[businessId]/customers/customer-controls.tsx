'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  forgetCustomerAction,
  optOutCustomerAction,
  setOffersSignupAction,
  setOrderStatusAction,
  type CustomerActionResult,
} from '@/server/admin/customer-actions';

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (action: () => Promise<CustomerActionResult>) =>
    start(async () => {
      const result = await action();
      setNotice(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
      if (result.ok) router.refresh();
    });
  return { pending, notice, run };
}

function Notice({ notice }: { notice: { ok: boolean; text: string } | null }) {
  if (!notice) return null;
  return (
    <span className={`admin__message admin__message--${notice.ok ? 'ok' : 'error'}`} role={notice.ok ? 'status' : 'alert'}>
      {notice.text}
    </span>
  );
}

export function OffersSignupToggle({ businessId, enabled }: { businessId: string; enabled: boolean }) {
  const { pending, notice, run } = useAction();
  return (
    <div className="admin__actions">
      <label className="cu__switch">
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={pending}
          onChange={(event) => run(() => setOffersSignupAction(businessId, event.target.checked))}
        />
        <span>إظهار «اشترك ليصلك جديد العروض» في المنيو · Show offers sign-up on the menu</span>
      </label>
      <Notice notice={notice} />
    </div>
  );
}

const STATUS_LABELS = {
  SENT: 'مرسل · Sent',
  CONFIRMED: 'مؤكد · Confirmed',
  CANCELLED: 'ملغى · Cancelled',
} as const;

export function OrderStatusSelect({ businessId, orderId, status }: { businessId: string; orderId: string; status: keyof typeof STATUS_LABELS }) {
  const { pending, notice, run } = useAction();
  return (
    <>
      <select
        className="admin__input cu__status"
        aria-label="حالة الطلب · Order status"
        value={status}
        disabled={pending}
        onChange={(event) => run(() => setOrderStatusAction(businessId, orderId, event.target.value))}
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {notice && !notice.ok ? <Notice notice={notice} /> : null}
    </>
  );
}

export function CustomerRowActions({ businessId, customerId, subscribed }: { businessId: string; customerId: string; subscribed: boolean }) {
  const { pending, notice, run } = useAction();
  return (
    <div className="cu__row-actions">
      {subscribed ? (
        <button
          type="button"
          className="admin__button admin__button--secondary"
          disabled={pending}
          onClick={() => run(() => optOutCustomerAction(businessId, customerId))}
        >
          إيقاف العروض · Stop offers
        </button>
      ) : null}
      <button
        type="button"
        className="admin__button admin__button--secondary"
        disabled={pending}
        onClick={() => {
          if (window.confirm('حذف اسم العميل ورقمه نهائياً؟ تبقى طلباته في الإحصائيات بدون بياناته. · Delete this customer’s name and number for good?')) {
            run(() => forgetCustomerAction(businessId, customerId));
          }
        }}
      >
        حذف بياناته · Delete data
      </button>
      {notice && !notice.ok ? <Notice notice={notice} /> : null}
    </div>
  );
}
