'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { BellRing, Check } from 'lucide-react';
import type { Language } from '../types';
import { isValidPhone } from '@/lib/delivery';

const storageKey = (publicId: string) => `offers-signup:${publicId}`;
const never = () => () => undefined;

/** Signed up on this device before. False on the server and when storage is blocked. */
function signedUpBefore(publicId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(publicId)) === '1';
  } catch {
    return false;
  }
}

/**
 * "Get our offers": a customer leaves a name and number for the restaurant's
 * offers. Shown only when the restaurant turned sign-up on. Consent is a box
 * the customer ticks themselves, never pre-ticked, and the text says how to
 * stop. Once signed up on this device, the card says so instead of asking again.
 */
export function OffersSignup({ lang, publicId, restaurantNameAr, restaurantNameEn }: {
  lang: Language;
  publicId: string;
  restaurantNameAr: string;
  restaurantNameEn: string;
}) {
  const isAr = lang === 'ar';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [showErrors, setShowErrors] = useState(false);

  const remembered = useSyncExternalStore(never, () => signedUpBefore(publicId), () => false);
  const done = state === 'done' || remembered;

  const phoneError = !isValidPhone(phone);
  const consentError = !consent;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (phoneError || consentError) {
      setShowErrors(true);
      return;
    }
    setState('sending');
    try {
      const response = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ publicId, name, phone, consent: true }),
      });
      const result = (await response.json().catch(() => ({ ok: false }))) as { ok?: boolean };
      if (!result.ok) throw new Error('not saved');
      setState('done');
      try {
        window.localStorage.setItem(storageKey(publicId), '1');
      } catch {
        // The sign-up is saved on the server either way.
      }
    } catch {
      setState('error');
    }
  };

  return (
    <section
      aria-labelledby="offers-signup-title"
      data-offers-signup=""
      className="mx-auto my-8 w-full max-w-xl px-4"
    >
      <div className="rounded-3xl border border-amber-400/30 bg-stone-950/80 p-5 shadow-xl shadow-black/30">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
            <BellRing className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="offers-signup-title" className="text-base font-black text-white">
              {isAr ? 'اشترك ليصلك جديد العروض' : 'Get our latest offers'}
            </h2>
            <p className="text-xs text-stone-400">
              {isAr ? `عروض ${restaurantNameAr} تصلك على جوالك.` : `${restaurantNameEn}'s offers, on your phone.`}
            </p>
          </div>
        </div>

        {done ? (
          <p className="mt-4 flex items-center gap-2 text-sm font-bold text-emerald-300" role="status">
            <Check className="h-4 w-4" aria-hidden="true" />
            {isAr ? 'تم الاشتراك. شكراً لك!' : 'You are signed up. Thank you!'}
          </p>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={submit} noValidate>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={isAr ? 'الاسم (اختياري)' : 'Name (optional)'}
              aria-label={isAr ? 'الاسم (اختياري)' : 'Name (optional)'}
              autoComplete="name"
              maxLength={80}
              className="w-full rounded-xl border border-emerald-950 bg-stone-900 px-3 py-2.5 text-sm text-white placeholder-stone-400 focus:border-emerald-400 focus:outline-none"
            />
            <div>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="05xxxxxxxx"
                aria-label={isAr ? 'رقم الجوال لاستلام العروض' : 'Phone number for offers'}
                aria-invalid={showErrors && phoneError}
                aria-describedby={showErrors && phoneError ? 'offers-phone-error' : undefined}
                className="w-full rounded-xl border border-emerald-950 bg-stone-900 px-3 py-2.5 text-sm text-white placeholder-stone-400 focus:border-emerald-400 focus:outline-none aria-[invalid=true]:border-red-400 rtl:text-right"
              />
              {showErrors && phoneError ? (
                <p id="offers-phone-error" className="mt-1 text-[11px] text-red-300">
                  {isAr ? 'أدخل رقم جوال صحيح.' : 'Enter a valid phone number.'}
                </p>
              ) : null}
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-5 text-stone-300">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                aria-invalid={showErrors && consentError}
                className="mt-1 h-4 w-4 accent-emerald-500"
              />
              <span>
                {isAr
                  ? `أوافق على أن يرسل لي ${restaurantNameAr} عروضه على هذا الرقم (واتساب أو رسالة نصية). يمكنني إلغاء الاشتراك في أي وقت بإبلاغ المطعم.`
                  : `I agree to receive ${restaurantNameEn}'s offers on this number (WhatsApp or SMS). I can stop any time by telling the restaurant.`}
              </span>
            </label>
            {showErrors && consentError ? (
              <p className="text-[11px] text-red-300">{isAr ? 'وافق على استلام العروض للاشتراك.' : 'Tick the box to sign up.'}</p>
            ) : null}
            {state === 'error' ? (
              <p className="text-[11px] text-red-300" role="alert">
                {isAr ? 'تعذّر الاشتراك الآن. حاول مرة أخرى.' : 'Could not sign you up. Please try again.'}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={state === 'sending'}
              className="min-h-11 w-full rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-stone-950 transition hover:bg-amber-300 disabled:opacity-60"
            >
              {state === 'sending' ? (isAr ? 'جارٍ الاشتراك…' : 'Signing up…') : isAr ? 'اشترك' : 'Sign up'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
