'use client';

import React, { useState, useEffect } from 'react';
import { currencyUnit, formatAmount } from '../money';
import { 
  Star, 
  Clock, 
  ChevronDown, 
  Sparkles, 
  Flame, 
  Activity, 
  Timer,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  MessageCircle,
  MapPin,
  Phone
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSabah } from '../context';
import type { MenuItem } from '../data/menuData';
import type { Language } from '../types';

/** How hero slides move, chosen on the Design page. */
export type HeroEffect = 'slide' | 'fade' | 'zoom' | 'pan' | 'flip' | 'story';

interface HeroSectionProps {
  lang: Language;
  effect?: string;
  /** Milliseconds each slide stays, as the restaurant chose. */
  intervalMs?: number;
  onOpenCalories: () => void;
  onSelectFeaturedItem: (item: MenuItem) => void;
}


export const HeroSection: React.FC<HeroSectionProps> = ({ 
  lang, 
  effect: requestedEffect = 'slide',
  intervalMs,
  onOpenCalories,
  onSelectFeaturedItem 
}) => {
  const { info: RESTAURANT_INFO, items: MENU_ITEMS, slides: FULL_WIDTH_SLIDES } = useSabah();
  const isAr = lang === 'ar';
  const effect: HeroEffect = (['slide', 'fade', 'zoom', 'pan', 'flip', 'story'] as const).find(
    (name) => name === requestedEffect,
  ) ?? 'slide';
  // Stories move faster, like the apps they borrow from.
  const interval = intervalMs ?? (effect === 'story' ? 5000 : 6500);
  const [[currentSlide, direction], setSlideState] = useState<[number, number]>([0, 0]);

  // Auto-play slide motion every 6 seconds
  const slideCount = FULL_WIDTH_SLIDES.length;
  useEffect(() => {
    if (slideCount < 2) return;
    const timer = setInterval(() => {
      setSlideState(([prev]) => [(prev + 1) % slideCount, 1]);
    }, interval);
    return () => clearInterval(timer);
  }, [slideCount, interval, currentSlide]);

  const slideIndex = currentSlide;
  const slide = FULL_WIDTH_SLIDES[slideIndex] ?? FULL_WIDTH_SLIDES[0]!;

  const paginate = (newDirection: number) => {
    setSlideState(([prev]) => {
      const next = (prev + newDirection + FULL_WIDTH_SLIDES.length) % FULL_WIDTH_SLIDES.length;
      return [next, newDirection];
    });
  };

  // Offer slides and the name-only fallback slide are not dishes; they get no
  // "order this meal" button rather than one that does nothing.
  const slideItem = MENU_ITEMS.find((i) => i.id === slide.id && !i.isUnavailable);

  const handleOrderCurrent = () => {
    if (slideItem) onSelectFeaturedItem(slideItem);
  };

  // Variants per effect. Each keeps the slide covering the banner, so the
  // text over it stays readable at every frame.
  const towards = (dir: number) => (dir > 0 ? (isAr ? '-100%' : '100%') : isAr ? '100%' : '-100%');
  const slideVariants = {
    slide: {
      enter: (dir: number) => ({ x: towards(dir), opacity: 0, scale: 1.05 }),
      center: {
        x: 0,
        opacity: 1,
        scale: 1,
        transition: { x: { type: 'spring' as const, stiffness: 260, damping: 30 }, opacity: { duration: 0.5 }, scale: { duration: 0.8 } },
      },
      exit: (dir: number) => ({
        x: towards(-dir),
        opacity: 0,
        scale: 0.98,
        transition: { x: { type: 'spring' as const, stiffness: 260, damping: 30 }, opacity: { duration: 0.4 } },
      }),
    },
    fade: {
      enter: { opacity: 0 },
      center: { opacity: 1, transition: { duration: 1.1 } },
      exit: { opacity: 0, transition: { duration: 1.1 } },
    },
    zoom: {
      enter: { opacity: 0, scale: 1.3 },
      center: { opacity: 1, scale: 1, transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] as const } },
      exit: { opacity: 0, scale: 0.92, transition: { duration: 0.8 } },
    },
    pan: {
      enter: { opacity: 0 },
      center: { opacity: 1, transition: { duration: 1 } },
      exit: { opacity: 0, transition: { duration: 1 } },
    },
    flip: {
      enter: (dir: number) => ({ rotateY: (dir > 0 ? 1 : -1) * (isAr ? -90 : 90), opacity: 0 }),
      center: { rotateY: 0, opacity: 1, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as const } },
      exit: (dir: number) => ({ rotateY: (dir > 0 ? -1 : 1) * (isAr ? -90 : 90), opacity: 0, transition: { duration: 0.7 } }),
    },
    story: {
      enter: { opacity: 0, scale: 1.18 },
      center: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
      exit: { opacity: 0, transition: { duration: 0.4 } },
    },
  }[effect];

  return (
    <section id="hero" className="relative w-full overflow-hidden bg-black select-none border-b border-emerald-950">
      
      {/* 1. Full-Width Panoramic Motion Banner (Edge-to-Edge 100vw) */}
      <div
        className="relative w-full sm:h-[clamp(400px,62svh,600px)] lg:h-[clamp(440px,64svh,640px)] overflow-hidden bg-[var(--sf-ink-070c08)]"
        data-hero-effect={effect}
        // The phone photo takes the shape of the first banner's photo, kept
        // between a tall and a wide frame, so no band of empty colour shows.
        style={{
          ...(effect === 'flip' ? { perspective: '1400px' } : {}),
          ...(FULL_WIDTH_SLIDES[0]?.aspect
            ? { '--sf-hero-ratio': String(Math.min(2.1, Math.max(1.2, FULL_WIDTH_SLIDES[0].aspect))) }
            : {}),
        } as React.CSSProperties}
      >
        {/* Story bars: one per slide, the current one filling as it plays. */}
        {effect === 'story' && slideCount > 1 ? (
          <div className="absolute top-3 inset-x-4 z-30 flex gap-1.5" aria-hidden="true">
            {FULL_WIDTH_SLIDES.map((entry, index) => (
              <span key={entry.id || index} className="h-1 flex-1 rounded-full bg-white/30 overflow-hidden">
                <span
                  key={index === slideIndex ? `active-${slideIndex}` : `idle-${index}`}
                  className={`block h-full bg-white ${index < slideIndex ? 'w-full' : index === slideIndex ? 'sf-story-fill' : 'w-0'}`}
                  style={index === slideIndex ? { animationDuration: `${interval}ms` } : undefined}
                />
              </span>
            ))}
          </div>
        ) : null}

        
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={slideIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            // On a phone the photo has its own frame and the text sits below
            // it; from tablet up the text floats on a small card beside it.
            className="sf-hero-photo absolute inset-x-0 top-0 sm:inset-0 w-full sm:h-full"
            // Swipe between slides with a finger; the next slide follows the
            // reading direction (leftwards in Arabic).
            drag={slideCount > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={(_event, info) => {
              if (Math.abs(info.offset.x) < 60) return;
              const towardsNext = isAr ? info.offset.x > 0 : info.offset.x < 0;
              paginate(towardsNext ? 1 : -1);
            }}
          >
            {/* Full-Width Image */}
            {slide.image ? <img
              src={slide.image}
              srcSet={slide.imageSrcSet}
              sizes="100vw"
              // One photo, two crops: the phone one below `sm`, the wide one above.
              style={
                {
                  '--sf-pos': slide.imagePosition ?? '50% 50%',
                  '--sf-pos-m': slide.imageMobilePosition ?? slide.imagePosition ?? '50% 50%',
                } as React.CSSProperties
              }
              alt={isAr ? slide.headlineAr : slide.headlineEn}
              className={`sf-hero-img w-full h-full object-cover ${
                effect === 'zoom' || effect === 'story' ? 'sf-kb-zoom' : effect === 'pan' ? 'sf-kb-pan' : ''
              }`}
              referrerPolicy="no-referrer"
            /> : <div className="w-full h-full bg-gradient-to-br from-emerald-950 via-stone-950 to-black" />}
            {/* No scrim by default: the photo is shown as it is, unless the
                restaurant chose an overlay for its own banner. */}
            {slide.overlay ? (
              <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: slide.overlay / 100 }} aria-hidden="true" />
            ) : null}
          </motion.div>
        </AnimatePresence>

        {/* Holds the photo's place on a phone, where the text follows it. */}
        <div className="sm:hidden sf-hero-photo" aria-hidden="true" />

        {/* Animated Rising Steam across the banner */}
        <div className="hidden absolute top-1/4 right-1/4 lg:right-1/3 items-center gap-3 pointer-events-none z-20 opacity-75">
          <svg className="w-10 h-20 text-amber-100/40 animate-steam" viewBox="0 0 24 36" fill="none">
            <path d="M6 32 C 10 24, 2 16, 8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <svg className="w-10 h-20 text-amber-100/50 animate-steam [animation-delay:1.4s]" viewBox="0 0 24 36" fill="none">
            <path d="M12 34 C 18 26, 8 18, 14 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* 2. Hero Content Overlay (Positioned gracefully over the full-width panoramic banner) */}
        <div className="relative sm:absolute sm:inset-0 z-20 sf-hero-overlay flex flex-col justify-end sm:justify-between gap-2.5 sm:gap-0 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-3 pb-2.5 sm:py-8 lg:py-12 pointer-events-none">
          
          {/* Top Live Trust Strip — desktop and tablet; on a phone the same
              facts sit in the action row below the banner. */}
          <div className="hidden sm:flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
            <div className="flex flex-wrap items-center gap-2">
              {(isAr ? RESTAURANT_INFO.addressAr : RESTAURANT_INFO.addressEn) ? (
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/90 backdrop-blur-md border border-emerald-500/50 text-emerald-300 text-xs font-black shadow-lg max-w-[18rem]">
                <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
                <span className="truncate">{isAr ? RESTAURANT_INFO.addressAr : RESTAURANT_INFO.addressEn}</span>
              </span>
              ) : null}

              {RESTAURANT_INFO.rating > 0 ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-amber-500/40 text-amber-300 text-xs font-bold shadow-lg">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="tabular-nums">{RESTAURANT_INFO.rating.toFixed(1)}</span>
                {RESTAURANT_INFO.reviewCount > 0 ? (
                <span className="text-stone-400 text-[11px] font-normal">
                  ({RESTAURANT_INFO.reviewCount.toLocaleString('en-US')}+ {isAr ? 'تقييم Google' : 'Google reviews'})
                </span>
                ) : null}
              </span>
              ) : null}

              {RESTAURANT_INFO.openingHoursAr || RESTAURANT_INFO.openingHoursEn ? (
              <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-stone-800 text-emerald-400 text-xs font-semibold shadow-lg">
                <Clock className="w-3.5 h-3.5" />
                <span>{isAr ? RESTAURANT_INFO.openingHoursAr : RESTAURANT_INFO.openingHoursEn}</span>
              </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenCalories}
                className="px-3.5 py-1.5 rounded-full bg-black/80 hover:bg-stone-900 backdrop-blur-md border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isAr ? 'جدول السعرات' : 'Calories Guide'}</span>
              </button>
            </div>
          </div>

          {/* Main Slide Content in Hero Foreground */}
          <div className="sf-hero-card max-w-2xl space-y-2 sm:space-y-4 pointer-events-auto sm:p-6 sm:rounded-3xl sm:bg-black/55 sm:backdrop-blur-md sm:border sm:border-white/10">
            
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-2 sm:space-y-3"
              >
                {/* Tag */}
                {(isAr ? slide.tagAr : slide.tagEn) ? (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/20 backdrop-blur-md border border-amber-400/50 text-amber-300 text-xs font-black uppercase tracking-wider shadow-lg">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>{isAr ? slide.tagAr : slide.tagEn}</span>
                </div>
                ) : null}

                {/* Headline: only when the slide has one. A banner that is only a
                    photo leaves no empty rows under it. */}
                {(isAr ? slide.headlineAr : slide.headlineEn) ? (
                <h2 className="sf-hero-title text-[1.75rem] leading-tight sm:text-5xl lg:text-6xl font-black text-white tracking-tight sm:leading-[1.12] drop-shadow-lg [text-wrap:balance]">
                  {isAr ? slide.headlineAr : slide.headlineEn}
                </h2>
                ) : null}

                {/* Subtitle */}
                {(isAr ? slide.subtitleAr : slide.subtitleEn) ? (
                <p className="text-[13px] sm:text-lg text-stone-200 leading-relaxed drop-shadow max-w-xl line-clamp-2 sm:line-clamp-none">
                  {isAr ? slide.subtitleAr : slide.subtitleEn}
                </p>
                ) : null}

                {/* Live Price Tag & Metrics */}
                {slide.price > 0 || slide.calories || slide.prepTimeAr ? (
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-0.5 sm:pt-1">
                  {slide.price > 0 ? (
                  <div className="flex items-baseline gap-1.5 bg-black/80 backdrop-blur-md border border-amber-400/50 rounded-xl sm:rounded-2xl px-3 py-1.5 sm:px-4 sm:py-2 shadow-2xl">
                    <span className="text-xl sm:text-3xl font-black text-amber-400 tabular-nums sf-price">
                      {formatAmount(slide.price, RESTAURANT_INFO.currency)}
                    </span>
                    <span className="text-sm font-bold text-emerald-400">
                      {currencyUnit(RESTAURANT_INFO.currency, isAr)}
                    </span>
                  </div>
                  ) : null}

                  {slide.calories ? (
                  <div className="flex items-center gap-2 text-xs bg-black/75 backdrop-blur-md border border-emerald-950 rounded-xl px-3 py-2 text-stone-200 shadow">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{slide.calories} {isAr ? 'سعرة' : 'kcal'}</span>
                  </div>
                  ) : null}

                  {slide.prepTimeAr ? (
                  <div className="flex items-center gap-2 text-xs bg-black/75 backdrop-blur-md border border-emerald-950 rounded-xl px-3 py-2 text-stone-200 shadow">
                    <Timer className="w-3.5 h-3.5 text-amber-400" />
                    <span>{slide.prepTimeAr}</span>
                  </div>
                  ) : null}
                </div>
                ) : null}

              </motion.div>
            </AnimatePresence>

            {/* CTAs */}
            <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 sm:gap-3 sm:pt-2">
              {slide.ctaUrl ? (
                <a
                  href={slide.ctaUrl}
                  data-banner-cta=""
                  {...(slide.ctaUrl.startsWith('https://') ? { target: '_blank', rel: 'noreferrer' } : {})}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 h-11 sm:h-auto px-5 sm:px-7 sm:py-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-stone-950 font-black text-sm border border-amber-200 transition-all"
                >
                  {(isAr ? slide.ctaLabelAr : slide.ctaLabelEn) || (isAr ? 'اكتشف' : 'Discover')}
                </a>
              ) : null}
              {slideItem ? (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleOrderCurrent}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 sm:gap-2.5 h-11 sm:h-auto px-5 sm:px-7 sm:py-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-stone-950 font-black text-sm shadow-2xl shadow-amber-500/40 border border-amber-200 transition-all cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4 stroke-[2.5]" />
                <span className="sm:hidden">{isAr ? 'اطلب الآن' : 'Order now'}</span>
                <span className="hidden sm:inline">{isAr ? 'طلب وتخصيص هذه الوجبة' : 'Order This Meal'}</span>
              </motion.button>
              ) : null}

              {RESTAURANT_INFO.whatsappNumber ? (
              <motion.a
                data-event="contact_whatsapp"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                href={`https://wa.me/${RESTAURANT_INFO.whatsappNumber}?text=${encodeURIComponent(
                  `السلام عليكم، أود طلب: ${slide.headlineAr} من ${RESTAURANT_INFO.nameAr}`
                )}`}
                target="_blank"
                rel="noreferrer"
                aria-label={isAr ? 'طلب سريع واتساب' : 'WhatsApp Order'}
                className={`inline-flex items-center justify-center gap-2 h-11 sm:h-auto ${slideItem ? 'w-11 shrink-0 sm:w-auto' : 'flex-1 sm:flex-initial px-5'} sm:px-6 sm:py-4 rounded-xl sm:rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-xl shadow-emerald-700/40 border border-emerald-400/40 transition-all cursor-pointer backdrop-blur-sm`}
              >
                <MessageCircle className="w-5 h-5 sm:w-4 sm:h-4 fill-white" />
                <span className={slideItem ? 'hidden sm:inline' : undefined}>{isAr ? 'طلب سريع واتساب' : 'WhatsApp Order'}</span>
              </motion.a>
              ) : null}

              <a
                href="#menu-section"
                className="hidden sm:inline-flex items-center justify-center gap-1.5 px-4 py-4 rounded-2xl bg-black/75 hover:bg-stone-900 border border-stone-700 text-stone-200 text-xs font-bold transition-colors backdrop-blur-md"
              >
                <span>{isAr ? 'تصفح كل المنيو' : 'Full Menu'}</span>
                <ChevronDown className="w-4 h-4" />
              </a>
            </div>

          </div>

          {/* Bottom Slider Progress Bars & Carousel Arrows */}
          <div className="flex items-center justify-center sm:justify-between gap-4 sm:pt-2 pointer-events-auto">
            
            {/* Progress indicators */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              {FULL_WIDTH_SLIDES.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setSlideState([idx, idx > currentSlide ? 1 : -1])}
                  aria-label={isAr ? s.headlineAr : s.headlineEn}
                  className={`h-2 sm:h-2.5 rounded-full transition-all cursor-pointer ${
                    currentSlide === idx
                      ? 'w-7 sm:w-10 bg-amber-400 shadow-lg shadow-amber-400/50'
                      : 'w-2 sm:w-2.5 bg-white/40 hover:bg-white/70'
                  }`}
                  title={isAr ? s.headlineAr : s.headlineEn}
                />
              ))}
            </div>

            {/* Slide Navigation Buttons — a phone swipes instead. */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => paginate(-1)}
                className="w-11 h-11 rounded-2xl bg-black/80 hover:bg-stone-900 border border-emerald-500/40 text-white flex items-center justify-center transition-all cursor-pointer shadow-xl backdrop-blur-md active:scale-95"
                title="السابق"
              >
                <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
              </button>
              <button
                onClick={() => paginate(1)}
                className="w-11 h-11 rounded-2xl bg-black/80 hover:bg-stone-900 border border-emerald-500/40 text-white flex items-center justify-center transition-all cursor-pointer shadow-xl backdrop-blur-md active:scale-95"
                title="التالي"
              >
                <ChevronRight className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* 3. Quick Highlights Strip Below Full-Width Banner (tablet and up) */}
      <div className="hidden sm:block w-full bg-[var(--sf-ink-070c08)] border-t border-emerald-950/80 py-3.5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-stone-300">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-white">{isAr ? RESTAURANT_INFO.nameAr : RESTAURANT_INFO.nameEn}</span>
            <span className="text-stone-500">·</span>
            <span className="text-stone-300">{isAr ? RESTAURANT_INFO.sloganAr : RESTAURANT_INFO.sloganEn}</span>
          </div>

          <div className="flex items-center gap-4 text-stone-400">
            <a href="#google-location" className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              <span>{isAr ? 'موقعنا على الخارطة بالأسفل ↓' : 'Google Map Below ↓'}</span>
            </a>
            <span className="text-stone-600">|</span>
            {RESTAURANT_INFO.phone ? (
            <a data-event="contact_phone" href={`tel:${RESTAURANT_INFO.phone}`} className="text-amber-400 font-black hover:underline tabular-nums">
              <span dir="ltr">{RESTAURANT_INFO.phoneFormatted}</span>
            </a>
            ) : null}
          </div>
        </div>
      </div>

      {/* 3b. On a phone: the restaurant's one-line description and the four
          things a visitor actually does, as one row of pills (icon beside its
          label, each a full 44px touch target) that wraps if there are many. */}
      <div className="sm:hidden w-full bg-[var(--sf-ink-070c08)] border-t border-emerald-950/80 px-4 pt-2.5 pb-3 space-y-2.5">
        {(isAr ? RESTAURANT_INFO.sloganAr : RESTAURANT_INFO.sloganEn) ? (
          <p className="text-[13px] text-stone-300 text-center line-clamp-1">
            {isAr ? RESTAURANT_INFO.sloganAr : RESTAURANT_INFO.sloganEn}
          </p>
        ) : null}
        <nav className="flex flex-wrap gap-2" aria-label={isAr ? 'تواصل سريع' : 'Quick actions'}>
          {RESTAURANT_INFO.phone ? (
            <a data-event="contact_phone" href={`tel:${RESTAURANT_INFO.phone}`} className="sf-quick">
              <Phone className="w-4 h-4 shrink-0" />
              <span>{isAr ? 'اتصال' : 'Call'}</span>
            </a>
          ) : null}
          {RESTAURANT_INFO.whatsappNumber ? (
            <a data-event="contact_whatsapp" href={`https://wa.me/${RESTAURANT_INFO.whatsappNumber}`} target="_blank" rel="noreferrer" className="sf-quick">
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>{isAr ? 'واتساب' : 'WhatsApp'}</span>
            </a>
          ) : null}
          <a href="#google-location" className="sf-quick">
            <MapPin className="w-4 h-4 shrink-0" />
            <span>{isAr ? 'الموقع' : 'Location'}</span>
          </a>
          <button type="button" onClick={onOpenCalories} className="sf-quick">
            <Activity className="w-4 h-4 shrink-0" />
            <span>{isAr ? 'السعرات' : 'Calories'}</span>
          </button>
        </nav>
      </div>

    </section>
  );
};
