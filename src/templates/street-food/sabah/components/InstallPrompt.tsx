'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Language } from '../types';
import './install-prompt.css';

/**
 * Offers to install this restaurant's menu as an app.
 *
 * When it appears: not on the first look at the menu. It waits for a real
 * step (a dish opened, or something added to the order), or for a visit after
 * an earlier one in another browser session. It then waits a moment, so it
 * never lands on top of the page while the page is still arriving.
 *
 * Where it sits: above the order bar on a phone, in the lower-right corner on a
 * wide screen (see install-prompt.css). It is hidden while a dish sheet, the
 * cart or the QR code is open, so it never covers the order or the controls.
 *
 * Who gets what: a browser that can install the app gets an install button; an
 * iPhone or iPad, which has no install button, gets the Home Screen steps.
 * "Later" is remembered for this restaurant on this device, and only this one.
 *
 * Analytics go through the menu's event endpoint, which records the event
 * name and device category only (src/server/analytics/record.ts).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Offer = 'none' | 'install' | 'ios';

/** The pause after the visitor's first real step, before the offer appears. */
export const SETTLE_MS = 1500;

const never = () => () => undefined;

/** Storage keys are per restaurant: a choice made for one menu never reaches another. */
function keysFor(publicId: string) {
  return {
    dismissed: `sf-install-dismissed:${publicId}`,
    visits: `sf-menu-visits:${publicId}`,
    session: `sf-menu-session:${publicId}`,
  };
}

function readDismissed(publicId: string): boolean {
  try {
    return window.localStorage.getItem(keysFor(publicId).dismissed) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether this is a visit after an earlier one. Decided once per browser
 * session, so reloading a first visit still counts as a first visit.
 */
function isReturningVisit(publicId: string): boolean {
  try {
    const keys = keysFor(publicId);
    const decided = window.sessionStorage.getItem(keys.session);
    if (decided !== null) return decided === 'returning';
    return Number(window.localStorage.getItem(keys.visits) ?? '0') >= 1;
  } catch {
    return false;
  }
}

/** Records this browser session once, so the next session can tell it is a return. */
function countVisit(publicId: string) {
  try {
    const keys = keysFor(publicId);
    if (window.sessionStorage.getItem(keys.session) !== null) return;
    const visits = Number(window.localStorage.getItem(keys.visits) ?? '0');
    window.sessionStorage.setItem(keys.session, visits >= 1 ? 'returning' : 'first');
    window.localStorage.setItem(keys.visits, String(visits + 1));
  } catch {
    // Private browsing: every visit looks like a first one, which is safe.
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * One event to the menu's event endpoint. Fire and forget: a counter never
 * blocks the menu. `keepalive` lets it finish even if the visitor leaves at once.
 */
function track(publicId: string, lang: Language, event: string, target: string | null) {
  try {
    void fetch('/api/events', {
      method: 'POST',
      body: JSON.stringify({ publicId, locale: lang, event, target }),
      headers: { 'content-type': 'application/json' },
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Analytics must never get in the way of the menu.
  }
}

export function InstallPrompt({
  lang,
  publicId,
  engaged,
  hidden,
}: {
  lang: Language;
  publicId: string;
  /** The visitor has opened a dish or put something in the order. */
  engaged: boolean;
  /** A sheet, the cart or the QR code is open: the offer waits behind it. */
  hidden: boolean;
}) {
  const isAr = lang === 'ar';
  // Device facts are read as stored values, so nothing is set in an effect.
  // The server render shows no offer; the browser fills it in after hydration.
  const iosDevice = useSyncExternalStore(
    never,
    () => /iPhone|iPad|iPod/.test(navigator.userAgent),
    () => false,
  );
  const standalone = useSyncExternalStore(never, isStandalone, () => true);
  const dismissedBefore = useSyncExternalStore(
    never,
    () => readDismissed(publicId),
    () => true,
  );
  // Read once on arrival; recorded for the next visit by the effect below.
  const [returning] = useState(() => isReturningVisit(publicId));

  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [closed, setClosed] = useState(false);
  const [settled, setSettled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const shownFor = useRef<Offer>('none');

  useEffect(() => {
    countVisit(publicId);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    const onPrompt = (event: Event) => {
      // Held back until the visitor asks for it, from our own button.
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setClosed(true);
      track(publicId, lang, 'app_installed', null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // Marks that the listeners above are attached, so a test (or a diagnostic)
    // can tell when a browser install event would be heard.
    document.documentElement.dataset.installReady = 'true';
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [publicId, lang]);

  const offer: Offer =
    standalone || dismissedBefore || closed ? 'none' : installEvent ? 'install' : iosDevice ? 'ios' : 'none';
  const invited = engaged || returning;
  const visible = offer !== 'none' && invited && settled && !hidden;

  useEffect(() => {
    if (offer === 'none' || !invited) return;
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [offer, invited]);

  // Counted once per kind of offer per page load, not once per re-render.
  useEffect(() => {
    if (!visible || shownFor.current === offer) return;
    shownFor.current = offer;
    track(publicId, lang, 'install_prompt_shown', offer);
  }, [visible, offer, publicId, lang]);

  const dismiss = () => {
    setClosed(true);
    track(publicId, lang, 'install_dismissed', offer);
    try {
      window.localStorage.setItem(keysFor(publicId).dismissed, '1');
    } catch {
      // Private browsing: the offer simply shows again next time.
    }
  };

  const install = async () => {
    if (!installEvent) return;
    track(publicId, lang, 'install_request', 'install');
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      setInstallEvent(null);
      if (choice.outcome === 'accepted') {
        setClosed(true);
        track(publicId, lang, 'install_accepted', null);
      } else {
        track(publicId, lang, 'install_declined', null);
      }
    } catch {
      // The browser refused a second prompt; the offer simply goes away.
      setInstallEvent(null);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="sf-install-title"
      lang={lang}
      dir={isAr ? 'rtl' : 'ltr'}
      data-install-prompt={offer}
      className="sf-install-prompt"
    >
      <p id="sf-install-title" className="text-sm font-bold text-white">
        {offer === 'install'
          ? isAr
            ? 'حمّل المنيو على هاتفك أو كمبيوترك للوصول السريع'
            : 'Install this menu on your phone or computer for quick access'
          : isAr
            ? 'أضف المنيو إلى شاشتك الرئيسية للوصول السريع'
            : 'Add this menu to your Home Screen'}
      </p>

      {offer === 'ios' && showSteps ? (
        <p className="mt-2 text-xs leading-relaxed text-stone-300">
          {isAr
            ? 'اضغط زر المشاركة (⬆) في Safari، ثم اختر «إضافة إلى الشاشة الرئيسية».'
            : 'In Safari, tap Share (⬆), then choose "Add to Home Screen".'}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        {offer === 'install' ? (
          <button
            type="button"
            onClick={install}
            className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-2 text-sm font-black text-stone-950 cursor-pointer"
          >
            {isAr ? 'تنزيل · Install' : 'Install'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowSteps((value) => !value)}
            aria-expanded={showSteps}
            className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-2 text-sm font-black text-stone-950 cursor-pointer"
          >
            {isAr ? 'كيف؟ · How?' : 'How?'}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="rounded-xl border border-stone-700 px-4 py-2 text-sm font-bold text-stone-200 cursor-pointer"
        >
          {isAr ? 'لاحقاً · Later' : 'Later'}
        </button>
      </div>
    </div>
  );
}
