'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Language } from '../types';

/**
 * Offers to install this menu as an app. A phone or computer whose browser
 * can install it gets an "install" button; an iPhone (which has no install
 * button) gets the Home Screen steps. A visitor who dismisses it is not asked
 * again on that device.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'sf-install-dismissed';
const never = () => () => undefined;

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt({ lang }: { lang: Language }) {
  const isAr = lang === 'ar';
  // Device facts are read as stored values, so nothing is set in an effect.
  // The server render hides the offer; the browser fills it in after hydration.
  const iosDevice = useSyncExternalStore(
    never,
    () => /iPhone|iPad|iPod/.test(navigator.userAgent),
    () => false,
  );
  const standalone = useSyncExternalStore(never, isStandalone, () => true);
  const dismissedBefore = useSyncExternalStore(never, readDismissed, () => true);

  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [closed, setClosed] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    const onPrompt = (event: Event) => {
      // Held back until the visitor asks for it, from our own button.
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setClosed(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const offer: 'none' | 'install' | 'ios' =
    standalone || dismissedBefore || closed ? 'none' : installEvent ? 'install' : iosDevice ? 'ios' : 'none';

  const dismiss = () => {
    setClosed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Private browsing: the offer simply shows again next time.
    }
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === 'accepted') setClosed(true);
  };

  if (offer === 'none') return null;

  return (
    <div
      role="dialog"
      aria-label={isAr ? 'تنزيل المنيو' : 'Install the menu'}
      data-install-prompt={offer}
      className="fixed inset-x-3 bottom-24 md:bottom-6 z-40 mx-auto max-w-md rounded-2xl border border-amber-500/40 bg-stone-950/95 p-4 shadow-2xl backdrop-blur"
    >
      {offer === 'install' ? (
        <p className="text-sm font-bold text-white">
          {isAr
            ? 'حمّل المنيو على هاتفك أو كمبيوترك للوصول السريع'
            : 'Install this menu on your phone or computer for quick access'}
        </p>
      ) : (
        <p className="text-sm font-bold text-white">
          {isAr ? 'أضف المنيو إلى شاشتك الرئيسية للوصول السريع' : 'Add this menu to your Home Screen'}
        </p>
      )}

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
