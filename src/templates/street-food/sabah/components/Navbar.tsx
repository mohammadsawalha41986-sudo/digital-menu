'use client';

import React from 'react';
import { ShoppingBag, MapPin, Phone, Globe, QrCode, Activity, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSabah } from '../context';
import type { Language } from '../types';

interface NavbarProps {
  lang: Language;
  onToggleLang: () => void;
  cartCount: number;
  onOpenCart: () => void;
  onOpenQr: () => void;
  onOpenCalories: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  lang,
  onToggleLang,
  cartCount,
  onOpenCart,
  onOpenQr,
  onOpenCalories,
}) => {
  const { info: RESTAURANT_INFO, logoUrl } = useSabah();
  const isAr = lang === 'ar';

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--sf-ink-080d09)]/95 backdrop-blur-md border-b border-emerald-950/80 transition-colors shadow-lg shadow-black/30">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4 md:gap-8">
        
        {/* Zone 1: Brand Wordmark & Logo */}
        <a href="#hero" className="flex items-center gap-3 min-w-0 group">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 2 }}
            whileTap={{ scale: 0.95 }}
            className="w-11 h-11 shrink-0 rounded-xl bg-gradient-to-br from-emerald-600/25 via-amber-500/20 to-emerald-950/60 border border-emerald-500/50 flex items-center justify-center overflow-hidden p-1 shadow-md shadow-emerald-950/40 group-hover:border-amber-400/90 transition-colors relative"
          >
            {logoUrl ? <img
              src={logoUrl}
              alt={RESTAURANT_INFO.nameAr}
              className="w-full h-full object-contain filter drop-shadow"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            /> : null}
            <div className="absolute inset-0 bg-emerald-500/10 pointer-events-none rounded-xl" />
          </motion.div>
          
          <div className="flex flex-col min-w-0">
            {/* The restaurant name is the page's one h1; hero slides are h2. */}
            <div className="text-lg md:text-xl font-black text-white tracking-tight leading-tight group-hover:text-amber-300 transition-colors flex items-center gap-1.5">
              <h1
                className="truncate text-[length:inherit] font-[inherit] leading-[inherit]"
                // An Arabic-only name on an English page is still Arabic; say so
                // for screen readers and the text renderer.
                {...(!isAr && RESTAURANT_INFO.nameEn === RESTAURANT_INFO.nameAr ? { lang: 'ar', dir: 'rtl' } : {})}
              >
                {isAr ? RESTAURANT_INFO.nameAr : RESTAURANT_INFO.nameEn}
              </h1>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <span className="text-[11px] text-emerald-300/80 font-medium truncate">
              {isAr ? RESTAURANT_INFO.addressAr : RESTAURANT_INFO.addressEn}
            </span>
          </div>
        </a>

        {/* Zone 2: Navigation Links (Clean, No Paper Flyer) */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-semibold text-stone-300">
          <a
            href="#menu-section"
            className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            {isAr ? 'قائمة الطعام' : 'Menu'}
          </a>
          <button
            onClick={onOpenCalories}
            className="flex items-center gap-1.5 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer text-stone-300"
          >
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>{isAr ? 'جدول السعرات' : 'Calories Guide'}</span>
          </button>
          {RESTAURANT_INFO.rating > 0 ? (
          <a
            href="#customer-reviews"
            className="flex items-center gap-1.5 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 text-stone-300"
          >
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>{isAr ? 'تقييمات العملاء' : 'Reviews'}</span>
          </a>
          ) : null}
          <button
            onClick={onOpenQr}
            className="flex items-center gap-1.5 hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer text-stone-300"
          >
            <QrCode className="w-4 h-4 text-stone-400" />
            <span>{isAr ? 'رمز الطاولة' : 'Table QR'}</span>
          </button>
          <a
            href="#google-location"
            className="flex items-center gap-1.5 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0 text-stone-300"
          >
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span>{isAr ? 'موقعنا بالخارطة' : 'Map'}</span>
          </a>
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Language Switcher */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onToggleLang}
            className="px-2.5 py-1.5 rounded-xl border border-emerald-900/60 bg-emerald-950/40 hover:bg-emerald-900/40 text-stone-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title={isAr ? 'Switch to English' : 'التحويل للعربية'}
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isAr ? 'EN' : 'عربي'}</span>
          </motion.button>

          {/* Quick Call */}
          <a
            href={`tel:${RESTAURANT_INFO.phone}`}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-850 text-stone-200 border border-emerald-900/50 hover:border-amber-500/40 text-xs font-bold transition-colors"
          >
            <Phone className="w-3.5 h-3.5 text-amber-400" />
            <span className="tabular-nums font-semibold" dir="ltr">{RESTAURANT_INFO.phoneFormatted}</span>
          </a>

          {/* Cart Button */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            onClick={onOpenCart}
            // The label is hidden on narrow phones; the icon alone needs a name.
            aria-label={isAr ? 'الطلب' : 'Order'}
            className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-stone-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer border border-amber-300"
          >
            <ShoppingBag className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden xs:inline whitespace-nowrap">{isAr ? 'الطلب' : 'Order'}</span>
            <AnimatePresence>
              {cartCount > 0 && (
                <motion.span
                  key="cart-badge"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="w-5 h-5 rounded-full bg-emerald-900 text-amber-300 border border-amber-400 text-xs flex items-center justify-center font-black tabular-nums shadow"
                >
                  {cartCount}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

      </div>
    </header>
  );
};
