'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Language } from '../types';
import './welcome-banner.css';

/**
 * A welcome message when a visitor opens the menu.
 *
 * It is a banner under the header, not a blocking popup: the menu stays under
 * the visitor's hand. Taps pass through it (see welcome-banner.css), it closes
 * with its button, and it leaves on its own after a few seconds. It is shown
 * once per browser session per restaurant, so a reload does not repeat it.
 */

/** How long the message stays before it leaves on its own. */
export const WELCOME_MS = 8000;

const never = () => () => undefined;

function key(publicId: string) {
  return `sf-welcome:${publicId}`;
}

/** Read-only: decided at mount, and recorded by the effect below. */
function alreadyWelcomed(publicId: string): boolean {
  try {
    return window.sessionStorage.getItem(key(publicId)) === '1';
  } catch {
    return false;
  }
}

export function WelcomeBanner({
  lang,
  publicId,
  nameAr,
  nameEn,
}: {
  lang: Language;
  publicId: string;
  nameAr: string;
  nameEn: string;
}) {
  const isAr = lang === 'ar';
  // Nothing is drawn until the page is hydrated, so the server and the first
  // browser render agree.
  const mounted = useSyncExternalStore(never, () => true, () => false);
  const [visible, setVisible] = useState(() => !alreadyWelcomed(publicId));

  useEffect(() => {
    if (!visible) return;
    try {
      window.sessionStorage.setItem(key(publicId), '1');
    } catch {
      // Storage blocked: the message may repeat on a reload, which is harmless.
    }
  }, [visible, publicId]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), WELCOME_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!mounted || !visible) return null;

  return (
    // A polite live region rather than role="status": the menu's own search
    // result is the page's status, and a second one would be ambiguous.
    <div aria-live="polite" lang={lang} dir={isAr ? 'rtl' : 'ltr'} data-welcome className="sf-welcome">
      <div className="sf-welcome__card">
        <div className="sf-welcome__text">
          <p className="sf-welcome__title">{isAr ? `أهلاً بك في ${nameAr}` : `Welcome to ${nameEn}`}</p>
          <p className="sf-welcome__body">
            {isAr ? 'تصفح المنيو وأضف أطباقك إلى الطلب' : 'Browse the menu and add your dishes to your order'}
          </p>
        </div>
        <button
          type="button"
          className="sf-welcome__close"
          aria-label={isAr ? 'إغلاق الرسالة' : 'Close message'}
          onClick={() => setVisible(false)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
