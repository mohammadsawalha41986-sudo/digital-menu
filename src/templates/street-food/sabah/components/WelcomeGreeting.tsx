'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Language } from '../types';
import './welcome-greeting.css';

/**
 * A welcome message when a visitor opens the menu.
 *
 * It appears in the middle of the page, with the restaurant's own figure when it
 * has set one. It leaves on its own after a few seconds, or with its button. It
 * is shown once per browser session per restaurant, so a reload does not repeat
 * it. Only the card takes taps: the menu around it stays usable.
 */

/** How long the message stays before it leaves on its own. */
export const WELCOME_MS = 9000;

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

export interface WelcomeFigure {
  url: string;
  altAr: string | null;
  altEn: string | null;
}

export function WelcomeGreeting({
  lang,
  publicId,
  nameAr,
  nameEn,
  figure,
}: {
  lang: Language;
  publicId: string;
  nameAr: string;
  nameEn: string;
  figure: WelcomeFigure | null;
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

  const alt = (isAr ? figure?.altAr : figure?.altEn) ?? '';

  return (
    <div lang={lang} dir={isAr ? 'rtl' : 'ltr'} data-welcome className="sf-welcome">
      <section className="sf-welcome__card" aria-label={isAr ? 'رسالة الترحيب' : 'Welcome message'}>
        {figure ? (
          <img src={figure.url} alt={alt} className="sf-welcome__figure" data-welcome-figure />
        ) : null}
        <h2 className="sf-welcome__title">{isAr ? 'أهلاً بمن زارنا' : 'Welcome to everyone who visits us'}</h2>
        <p className="sf-welcome__name">{isAr ? nameAr : nameEn}</p>
        <p className="sf-welcome__body">
          {isAr ? 'تفضّل، المنيو بين يديك' : 'Make yourself at home, the menu is yours'}
        </p>
        <button type="button" className="sf-welcome__start" onClick={() => setVisible(false)}>
          {isAr ? 'ابدأ التصفح' : 'Start browsing'}
        </button>
      </section>
    </div>
  );
}
