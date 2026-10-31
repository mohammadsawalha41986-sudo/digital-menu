'use client';

import React from 'react';
import { currencyUnit, formatAmount } from '../money';
import { useSabah } from '../context';
import { Plus, Flame, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MenuItem } from '../data/menuData';
import type { Language } from '../types';

interface MenuItemCardProps {
  item: MenuItem;
  lang: Language;
  onSelect: (item: MenuItem) => void;
  /**
   * `large` gives the photograph a taller frame for photo-led menus; `wide`
   * spans a whole row, with the photograph beside the text from `sm` up.
   */
  size?: 'regular' | 'large' | 'wide';
}

export const MenuItemCard: React.FC<MenuItemCardProps> = ({
  item,
  lang,
  onSelect,
  size = 'regular',
}) => {
  const { currency } = useSabah().info;
  const isAr = lang === 'ar';
  // Regular cards sit two-up on a phone, so below `sm` they drop the
  // secondary line and the button label to keep name and price readable.
  const compact = size === 'regular';
  // Without a photo there is nothing to set beside the text.
  const wide = size === 'wide' && Boolean(item.image);

  return (
    <motion.div
      // Stable hooks for tests and analytics: the item code, price and
      // calories as rendered.
      data-item={item.id}
      data-unavailable={item.isUnavailable ? '' : undefined}
      data-card-size={size}
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      whileHover={{ y: -4 }}
      className={`sf-card ${wide ? 'sf-card--wide sm:flex-row' : ''} group flex flex-col justify-between bg-stone-950/95 rounded-2xl border border-emerald-950/90 hover:border-emerald-500/60 transition-all duration-300 overflow-hidden shadow-lg hover:shadow-2xl hover:shadow-emerald-950/50`}
    >
      
      {/* Top Media & Banner with Image Motion & Warm Appetizing Glow */}
      {item.image ? (
        <div className={`sf-card-media relative w-full overflow-hidden bg-stone-950 ${wide ? 'aspect-[16/10] sm:aspect-auto sm:w-1/2 sm:min-h-72 lg:min-h-80 shrink-0' : size === 'large' ? 'aspect-[4/3]' : 'aspect-[16/10]'}`}>
          <img
            src={item.image}
            // WebP widths from the upload; the browser picks the one the card needs.
            srcSet={item.imageSrcSet}
            sizes={wide ? '(min-width: 640px) 50vw, 100vw' : size === 'large' ? '(min-width: 1024px) 50vw, 100vw' : '(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw'}
            style={{ objectPosition: item.imagePosition }}
            loading="lazy"
            decoding="async"
            alt={isAr ? item.nameAr : item.nameEn}
            className={`w-full h-full object-cover group-hover:scale-108 transition-transform duration-500 ${item.isUnavailable ? 'grayscale opacity-60' : ''}`}
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          
          {/* Subtle badges */}
          <div className="absolute top-2.5 right-2.5 rtl:right-2.5 ltr:left-2.5 flex items-center gap-1.5 z-10">
            {item.isOffer && (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 text-stone-950 shadow-md flex items-center gap-1 border border-amber-300">
                <Sparkles className="w-3 h-3 text-stone-950" />
                <span>{isAr ? 'عرض توفير' : 'Value Deal'}</span>
              </span>
            )}
            {item.isNew ? (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-amber-400 text-stone-950 shadow" data-new>
                {isAr ? 'جديد' : 'New'}
              </span>
            ) : null}
            {item.isPopular && !item.isOffer && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 shadow">
                {isAr ? 'الأكثر طلباً' : 'Bestseller'}
              </span>
            )}
          </div>

          {item.isSpicyOption && (
            <div className="absolute top-2.5 left-2.5 rtl:left-2.5 ltr:right-2.5 z-10">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-red-950/90 text-red-200 border border-red-700/80 flex items-center gap-1 shadow">
                <Flame className="w-3 h-3 text-red-400" />
                <span className={compact ? 'hidden sm:inline' : undefined}>{isAr ? 'عادي أو حار' : 'Mild / Spicy'}</span>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="h-2.5 bg-gradient-to-r from-emerald-600 to-amber-500" />
      )}

      {/* Card Body */}
      <div className={`${compact ? 'p-3 space-y-2' : 'p-4 space-y-3'} ${wide ? 'sm:p-8 lg:p-10 sm:gap-6' : 'sm:p-5'} sm:space-y-3 flex-1 flex flex-col justify-between`}>
        <div className={compact ? 'space-y-1 sm:space-y-1.5' : 'space-y-1.5'}>
          
          {/* Title */}
          <div className="flex items-start justify-between gap-2">
            <h3 className={`${compact ? 'text-[15px] line-clamp-2 sm:line-clamp-none' : wide ? 'text-xl sm:text-3xl' : 'text-base'} ${wide ? '' : 'sm:text-lg'} font-bold text-white group-hover:text-amber-300 transition-colors leading-snug`}>
              {isAr ? item.nameAr : item.nameEn}
            </h3>
          </div>

          {/* Description */}
          {(item.descriptionAr || item.descriptionEn) && (
            <p className={`${compact ? 'hidden sm:block' : ''} ${wide ? 'text-sm sm:text-base line-clamp-4' : 'text-xs sm:text-sm line-clamp-2'} text-stone-300 leading-relaxed`}>
              {isAr ? item.descriptionAr : item.descriptionEn}
            </p>
          )}

          {/* Calories stay visible at every size — menus are expected to show
              them wherever a dish is listed. Nothing is said about a dish the
              restaurant did not say itself. */}
          {item.calories || (item.options && item.options.length > 0) ? (
          <div className={`flex items-center gap-2 ${compact ? 'text-[11px] sm:text-xs' : 'text-xs'} text-stone-400 sm:pt-1`}>
            {item.calories ? (
              <span className="tabular-nums font-mono text-emerald-300/90 font-medium" data-calories>
                {item.calories} {isAr ? 'سعرة' : 'kcal'}
              </span>
            ) : null}
            {item.calories && item.options && item.options.length > 0 ? (
              <span aria-hidden="true" className="hidden sm:inline text-stone-600">·</span>
            ) : null}
            {item.options && item.options.length > 0 ? (
              <span className={`${compact ? 'hidden sm:inline' : ''} text-amber-300/90 font-semibold`}>
                {isAr ? `${item.options.length} أحجام` : `${item.options.length} sizes`}
              </span>
            ) : null}
          </div>
          ) : null}
        </div>

        {/* Price & Action Row */}
        <div className={`flex items-center justify-between ${compact ? 'gap-1.5 sm:gap-3 sm:pt-3 sm:border-t' : 'gap-3 pt-3 border-t'} border-emerald-950/80`}>
{item.noPrice ? (
  <span />
) : (
          <div className="flex flex-col">
            {/* On a phone the price speaks for itself; "Price" is shown only
                where there is room, "From" always (it changes the meaning). */}
            <span className={`text-[11px] text-stone-400 ${compact && !(item.options && item.options.length > 0) ? 'hidden sm:block' : ''}`}>
              {item.options && item.options.length > 0 ? (isAr ? 'يبدأ من' : 'From') : (isAr ? 'السعر' : 'Price')}
            </span>
            <div className="flex items-baseline gap-1">
              <span className={`${compact ? 'text-base' : 'text-lg'} sm:text-xl font-black text-amber-400 tabular-nums tracking-tight sf-price`} data-price>
                {formatAmount(item.price, currency)}
              </span>
              <span className="text-xs font-bold text-emerald-400">
                {currencyUnit(currency, isAr)}
              </span>
            </div>
          </div>
)}

          {item.noPrice && !item.isUnavailable ? null : item.isUnavailable ? (
            <span className="shrink-0 px-2.5 py-1.5 rounded-xl bg-stone-800 border border-stone-700 text-stone-300 text-[11px] sm:text-xs font-bold whitespace-nowrap">
            {isAr ? 'غير متوفر حالياً' : 'Currently unavailable'}
          </span>
          ) : (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.93 }}
            onClick={() => onSelect(item)}
            aria-label={item.options || item.isSpicyOption || item.choices?.length ? (isAr ? 'اختيار' : 'Choose') : (isAr ? 'إضافة' : 'Add')}
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 ${compact ? 'w-10 h-10 rounded-full sm:w-auto sm:h-auto sm:rounded-xl sm:px-3.5 sm:py-2' : 'px-3.5 py-2 rounded-xl'} bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-950/60 border border-emerald-400/30 transition-all cursor-pointer`}
          >
            <Plus className={`${compact ? 'w-5 h-5 sm:w-4 sm:h-4' : 'w-4 h-4'} stroke-[2.5]`} />
            <span className={compact ? 'hidden sm:inline' : undefined}>
              {item.options || item.isSpicyOption || item.choices?.length
                ? (isAr ? 'اختيار' : 'Choose')
                : (isAr ? 'إضافة' : 'Add')}
            </span>
          </motion.button>
          )}
        </div>

      </div>

    </motion.div>
  );
};
