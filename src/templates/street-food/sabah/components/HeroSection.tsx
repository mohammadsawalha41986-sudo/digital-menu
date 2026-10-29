'use client';

import React, { useState, useEffect } from 'react';
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
  MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RESTAURANT_INFO, MENU_ITEMS } from '../data/menuData';
import type { MenuItem } from '../data/menuData';
import type { Language } from '../types';

interface HeroSectionProps {
  lang: Language;
  onOpenCalories: () => void;
  onSelectFeaturedItem: (item: MenuItem) => void;
}

const FULL_WIDTH_SLIDES = [
  {
    id: 'broasted-regular-spicy',
    tagAr: 'الأكثر طلباً ومبيعاً',
    tagEn: 'Bestseller Favorite',
    headlineAr: 'بروستد صباح الليل الذهبي المقرمش',
    headlineEn: 'Golden Crispy Broasted Chicken',
    subtitleAr: 'دجاج طازج محضر يومياً بخلطة تتبيل صباح الليل السرية، يقدم ساخناً ومقرمشاً مع صوص الثوم والبطاطس',
    subtitleEn: 'Fresh daily chicken prepared with signature secret spices, served hot and crispy with garlic toum and fries',
    price: 20.00,
    calories: 250,
    prepTimeAr: '10 - 12 دقيقة',
    image: '/sabah/assets/menu/feature_broasted.png',
  },
  {
    id: 'shawarma-arabic',
    tagAr: 'نكهة الصاج الشامية الأصلية',
    tagEn: 'Authentic Saj Shawarma',
    headlineAr: 'شاورما عربي رولات بالثومية والبطاطا',
    headlineEn: 'Arabic Shawarma Saj Rolls Platter',
    subtitleAr: 'شاورما دجاج متبلة ومحشوة في خبز الصاج المحمص، مقطعة رولات في صحن مع صوص الثوم والبطاطس المقرمشة والمخلل',
    subtitleEn: 'Tender chicken shawarma rolled in toasted saj bread, served with house garlic dip and crispy fries',
    price: 19.00,
    calories: 800,
    prepTimeAr: '8 - 10 دقائق',
    image: '/sabah/assets/menu/dish_shawarma.png',
  },
  {
    id: 'combo-qarmsha',
    tagAr: 'عرض التوفير الأقوى',
    tagEn: 'Super Value Combo',
    headlineAr: 'وجبة القرمشة كومبو مع كينزا وبطاطا',
    headlineEn: 'Alqarmsha Crispy Combo Meal',
    subtitleAr: 'قطع بروستد مقرمشة + بطاطا مقلية ذهبية + مشروب كينزا المنعش + صوص ثوم صباح الليل الخاص',
    subtitleEn: 'Golden crispy broasted chicken + hot fries + chilled Kinza drink + house garlic sauce',
    price: 21.00,
    calories: 890,
    prepTimeAr: '10 - 15 دقيقة',
    image: '/sabah/assets/menu/combo_qarmsha.png',
  },
  {
    id: 'single-mix-bbq',
    tagAr: 'شواء الفحم الطبيعي',
    tagEn: 'Charcoal BBQ Feast',
    headlineAr: 'مشاوي مشكلة طازجة على الفحم',
    headlineEn: 'Fresh Charcoal Mixed Grill Platter',
    subtitleAr: 'كباب لحم غنم وكباب دجاج وشيش طاووق متبل على الجمر مع الخبز الساخن والبصل والسماق',
    subtitleEn: 'Succulent lamb kebab, chicken kebab, and marinated shish tawooq grilled on hot natural coals',
    price: 38.00,
    calories: 650,
    prepTimeAr: '12 - 15 دقيقة',
    image: '/sabah/assets/menu/dish_sandwiches.png',
  },
];

export const HeroSection: React.FC<HeroSectionProps> = ({ 
  lang, 
  onOpenCalories,
  onSelectFeaturedItem 
}) => {
  const isAr = lang === 'ar';
  const [[currentSlide, direction], setSlideState] = useState<[number, number]>([0, 0]);

  // Auto-play slide motion every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setSlideState(([prev]) => [(prev + 1) % FULL_WIDTH_SLIDES.length, 1]);
    }, 6500);
    return () => clearInterval(timer);
  }, []);

  const slideIndex = currentSlide;
  const slide = FULL_WIDTH_SLIDES[slideIndex] ?? FULL_WIDTH_SLIDES[0]!;

  const paginate = (newDirection: number) => {
    setSlideState(([prev]) => {
      const next = (prev + newDirection + FULL_WIDTH_SLIDES.length) % FULL_WIDTH_SLIDES.length;
      return [next, newDirection];
    });
  };

  const handleOrderCurrent = () => {
    const item = MENU_ITEMS.find((i) => i.id === slide.id);
    if (item) {
      onSelectFeaturedItem(item);
    }
  };

  // Variants for full-width slide motion
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? (isAr ? '-100%' : '100%') : (isAr ? '100%' : '-100%'),
      opacity: 0,
      scale: 1.05,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        x: { type: 'spring' as const, stiffness: 260, damping: 30 },
        opacity: { duration: 0.5 },
        scale: { duration: 0.8 },
      },
    },
    exit: (dir: number) => ({
      x: dir < 0 ? (isAr ? '-100%' : '100%') : (isAr ? '100%' : '-100%'),
      opacity: 0,
      scale: 0.98,
      transition: {
        x: { type: 'spring' as const, stiffness: 260, damping: 30 },
        opacity: { duration: 0.4 },
      },
    }),
  };

  return (
    <section id="hero" className="relative w-full overflow-hidden bg-black select-none border-b border-emerald-950">
      
      {/* 1. Full-Width Panoramic Motion Banner (Edge-to-Edge 100vw) */}
      <div className="relative w-full h-[580px] sm:h-[620px] lg:h-[700px] overflow-hidden">
        
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={slideIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0 w-full h-full"
          >
            {/* Full-Width Image */}
            <img
              src={slide.image}
              alt={isAr ? slide.headlineAr : slide.headlineEn}
              className="w-full h-full object-cover object-center filter brightness-[0.95] contrast-[1.08]"
              referrerPolicy="no-referrer"
            />

            {/* Cinematic Gradient Scrim: Dark on text side, transparent over food image */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30 lg:bg-gradient-to-r lg:from-black/95 lg:via-black/70 lg:to-black/20 rtl:lg:from-black/95 rtl:lg:via-black/70 rtl:lg:to-black/20" />
            
            {/* Ambient heat & glow overlay */}
            <div className="absolute inset-0 bg-radial from-amber-500/10 via-transparent to-black/40 pointer-events-none" />
          </motion.div>
        </AnimatePresence>

        {/* Animated Rising Steam across the banner */}
        <div className="absolute top-1/4 right-1/4 lg:right-1/3 flex items-center gap-3 pointer-events-none z-20 opacity-75">
          <svg className="w-10 h-20 text-amber-100/40 animate-steam" viewBox="0 0 24 36" fill="none">
            <path d="M6 32 C 10 24, 2 16, 8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <svg className="w-10 h-20 text-amber-100/50 animate-steam [animation-delay:1.4s]" viewBox="0 0 24 36" fill="none">
            <path d="M12 34 C 18 26, 8 18, 14 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>

        {/* 2. Hero Content Overlay (Positioned gracefully over the full-width panoramic banner) */}
        <div className="absolute inset-0 z-20 flex flex-col justify-between max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 pointer-events-none">
          
          {/* Top Live Trust Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pointer-events-auto">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/90 backdrop-blur-md border border-emerald-500/50 text-emerald-300 text-xs font-black shadow-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{isAr ? 'حي الصحافة • شمال الرياض' : 'Al-Sahafa • Riyadh'}</span>
              </span>

              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-amber-500/40 text-amber-300 text-xs font-bold shadow-lg">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="tabular-nums">4.8</span>
                <span className="text-stone-400 text-[11px] font-normal">
                  ({isAr ? '1,340+ تقييم Google' : '1,340+ Google reviews'})
                </span>
              </span>

              <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-stone-800 text-emerald-400 text-xs font-semibold shadow-lg">
                <Clock className="w-3.5 h-3.5" />
                <span>{isAr ? 'مفتوح يومياً حتى 3:00 فجراً' : 'Open till 3:00 AM'}</span>
              </span>
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
          <div className="max-w-2xl space-y-4 pointer-events-auto py-4">
            
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-3"
              >
                {/* Tag */}
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/20 backdrop-blur-md border border-amber-400/50 text-amber-300 text-xs font-black uppercase tracking-wider shadow-lg">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>{isAr ? slide.tagAr : slide.tagEn}</span>
                </div>

                {/* Headline */}
                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12] drop-shadow-lg [text-wrap:balance]">
                  {isAr ? slide.headlineAr : slide.headlineEn}
                </h1>

                {/* Subtitle */}
                <p className="text-sm sm:text-lg text-stone-200 leading-relaxed drop-shadow max-w-xl">
                  {isAr ? slide.subtitleAr : slide.subtitleEn}
                </p>

                {/* Live Price Tag & Metrics */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div className="flex items-baseline gap-1.5 bg-black/80 backdrop-blur-md border border-amber-400/50 rounded-2xl px-4 py-2 shadow-2xl">
                    <span className="text-2xl sm:text-3xl font-black text-amber-400 tabular-nums">
                      {slide.price.toFixed(2)}
                    </span>
                    <span className="text-sm font-bold text-emerald-400">
                      {isAr ? 'ريال' : 'SAR'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs bg-black/75 backdrop-blur-md border border-emerald-950 rounded-xl px-3 py-2 text-stone-200 shadow">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{slide.calories} {isAr ? 'سعرة' : 'kcal'}</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs bg-black/75 backdrop-blur-md border border-emerald-950 rounded-xl px-3 py-2 text-stone-200 shadow">
                    <Timer className="w-3.5 h-3.5 text-amber-400" />
                    <span>{slide.prepTimeAr}</span>
                  </div>
                </div>

              </motion.div>
            </AnimatePresence>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleOrderCurrent}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-stone-950 font-black text-sm shadow-2xl shadow-amber-500/40 border border-amber-200 transition-all cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4 stroke-[2.5]" />
                <span>{isAr ? 'طلب وتخصيص هذه الوجبة' : 'Order This Meal'}</span>
              </motion.button>

              <motion.a
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                href={`https://wa.me/${RESTAURANT_INFO.whatsappNumber}?text=${encodeURIComponent(
                  `السلام عليكم، أود طلب: ${slide.headlineAr} من مطعم صباح الليل`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-xl shadow-emerald-700/40 border border-emerald-400/40 transition-all cursor-pointer backdrop-blur-sm"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                <span>{isAr ? 'طلب سريع واتساب' : 'WhatsApp Order'}</span>
              </motion.a>

              <a
                href="#menu-section"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-4 rounded-2xl bg-black/75 hover:bg-stone-900 border border-stone-700 text-stone-200 text-xs font-bold transition-colors backdrop-blur-md"
              >
                <span>{isAr ? 'تصفح كل المنيو' : 'Full Menu'}</span>
                <ChevronDown className="w-4 h-4" />
              </a>
            </div>

          </div>

          {/* Bottom Slider Progress Bars & Carousel Arrows */}
          <div className="flex items-center justify-between gap-4 pt-2 pointer-events-auto">
            
            {/* Progress indicators */}
            <div className="flex items-center gap-2.5">
              {FULL_WIDTH_SLIDES.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setSlideState([idx, idx > currentSlide ? 1 : -1])}
                  className={`h-2.5 rounded-full transition-all cursor-pointer ${
                    currentSlide === idx
                      ? 'w-10 bg-amber-400 shadow-lg shadow-amber-400/50'
                      : 'w-2.5 bg-white/40 hover:bg-white/70'
                  }`}
                  title={isAr ? s.headlineAr : s.headlineEn}
                />
              ))}
            </div>

            {/* Slide Navigation Buttons */}
            <div className="flex items-center gap-2">
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

      {/* 3. Quick Highlights Strip Below Full-Width Banner */}
      <div className="w-full bg-[#070c08] border-t border-emerald-950/80 py-3.5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-stone-300">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-white">{isAr ? 'مطعم صباح الليل حي الصحافة' : 'Sabah El Lail Al-Sahafa'}</span>
            <span className="text-stone-500">·</span>
            <span className="text-stone-300">{isAr ? 'شاورما على الصاج • بروستد مقرمش • مشويات على الفحم • بيتزا • عصائر' : 'Shawarma • Broasted • BBQ • Pizza • Juices'}</span>
          </div>

          <div className="flex items-center gap-4 text-stone-400">
            <a href="#google-location" className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              <span>{isAr ? 'موقعنا على الخارطة بالأسفل ↓' : 'Google Map Below ↓'}</span>
            </a>
            <span className="text-stone-600">|</span>
            <a href={`tel:${RESTAURANT_INFO.phone}`} className="text-amber-400 font-black hover:underline tabular-nums">
              {RESTAURANT_INFO.phoneFormatted}
            </a>
          </div>
        </div>
      </div>

    </section>
  );
};
