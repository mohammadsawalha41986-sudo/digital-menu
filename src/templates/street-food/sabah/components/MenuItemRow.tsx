'use client';

import React, { useState } from 'react';
import { currencyUnit, formatAmount } from '../money';
import { useSabah } from '../context';
import { Plus, UtensilsCrossed } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MenuItem } from '../data/menuData';
import type { Language } from '../types';
import { SaleBadge, SaleWas } from './SaleTag';

interface MenuItemRowProps {
  item: MenuItem;
  lang: Language;
  onSelect: (item: MenuItem) => void;
}

export const MenuItemRow: React.FC<MenuItemRowProps> = ({
  item,
  lang,
  onSelect,
}) => {
  const { currency } = useSabah().info;
  const isAr = lang === 'ar';
  // A photo that cannot be loaded gives way to a plain brand-tinted frame.
  const [photoFailed, setPhotoFailed] = useState(false);

  return (
    <motion.div
      // Stable hooks for tests and analytics: the item code, price and
      // calories as rendered.
      data-item={item.id}
      data-unavailable={item.isUnavailable ? '' : undefined}
      whileHover={{ x: isAr ? -4 : 4 }}
      className="sf-card sf-card--row p-3.5 sm:p-4 rounded-2xl bg-stone-950/80 border border-emerald-950/90 hover:border-emerald-500/50 flex items-center justify-between gap-3 sm:gap-4 transition-all shadow-sm group"
    >
      {/* Thumbnail */}
      {item.image && (
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-stone-900 shrink-0 border border-emerald-950 group-hover:border-amber-400/40 transition-colors">
          {photoFailed ? (
            <div aria-hidden="true" className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-950 to-stone-900">
              <UtensilsCrossed className="w-6 h-6 text-emerald-400/40" strokeWidth={1.5} />
            </div>
          ) : (
          <img
            // An image that failed before the page became interactive never fires onError.
            ref={(img) => {
              if (img && img.complete && img.naturalWidth === 0) setPhotoFailed(true);
            }}
            src={item.image}
            srcSet={item.imageSrcSet}
            sizes="80px"
            style={{ objectPosition: item.imagePosition }}
            loading="lazy"
            decoding="async"
            alt={isAr ? item.nameAr : item.nameEn}
            className={`w-full h-full object-cover text-transparent group-hover:scale-105 transition-transform duration-300 ${item.isUnavailable ? 'grayscale opacity-60' : ''}`}
            referrerPolicy="no-referrer"
            onError={() => setPhotoFailed(true)}
          />
          )}
        </div>
      )}

      {/* Item info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors truncate">
            {isAr ? item.nameAr : item.nameEn}
          </h3>
          {item.isNew ? (
            <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-400 text-stone-950" data-new>
              {isAr ? 'جديد' : 'New'}
            </span>
          ) : null}
          {item.sale ? <SaleBadge item={item} isAr={isAr} small /> : null}
          {item.isOffer && !item.sale && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500 text-stone-950 shrink-0">
              {isAr ? 'عرض' : 'Offer'}
            </span>
          )}
          {item.isPopular && !item.isOffer && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30 shrink-0">
              {isAr ? 'مفضل' : 'Popular'}
            </span>
          )}
        </div>

        {(item.descriptionAr || item.descriptionEn) && (
          <p className="text-xs text-stone-400 line-clamp-1">
            {isAr ? item.descriptionAr : item.descriptionEn}
          </p>
        )}

        {item.calories || (item.options && item.options.length > 0) ? (
        <div className="flex items-center gap-2 text-[11px] text-stone-400">
          {item.calories ? (
            <span className="font-mono text-emerald-400 font-medium" data-calories>{item.calories} {isAr ? 'سعرة' : 'kcal'}</span>
          ) : null}
          {item.calories && item.options && item.options.length > 0 ? <span aria-hidden="true">·</span> : null}
          {item.options && item.options.length > 0 ? (
            <span className="text-amber-300 font-medium">
              {dishOptionsSummary(item, isAr)}
            </span>
          ) : null}
        </div>
        ) : null}
      </div>

      {/* Price & Add */}
      <div className="flex items-center gap-3 shrink-0">
{item.noPrice ? (
  <span />
) : (
        <div className="text-right rtl:text-right ltr:text-left">
          {item.sale ? <SaleWas item={item} isAr={isAr} currency={currency} showSaving={false} /> : null}
          <span className="text-base sm:text-lg font-black text-amber-400 tabular-nums sf-price" data-price>
            {formatAmount(item.price, currency)}
          </span>
          <span className="text-xs font-bold text-emerald-400 mr-1 ml-1">
            {currencyUnit(currency, isAr)}
          </span>
        </div>
)}

        {item.noPrice && !item.isUnavailable ? null : item.isUnavailable ? (
          <span className="shrink-0 px-2.5 py-1.5 rounded-xl bg-stone-800 border border-stone-700 text-stone-300 text-[11px] sm:text-xs font-bold whitespace-nowrap">
            {isAr ? 'غير متوفر حالياً' : 'Currently unavailable'}
          </span>
        ) : (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => onSelect(item)}
          aria-label={item.options || item.choices?.length ? (isAr ? 'اختيار' : 'Choose') : (isAr ? 'إضافة' : 'Add')}
          className="min-w-11 h-11 px-2.5 sm:px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-xs flex shrink-0 items-center justify-center gap-1 shadow-md shadow-emerald-950 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span className="hidden sm:inline">
            {item.options || item.choices?.length ? (isAr ? 'اختيار' : 'Choose') : (isAr ? 'إضافة' : 'Add')}
          </span>
        </motion.button>
        )}
      </div>
    </motion.div>
  );
};

function dishOptionsSummary(item: MenuItem, isAr: boolean) {
  if (!item.options) return '';
  return item.options.map((o) => (isAr ? o.nameAr : o.nameEn)).join(' / ');
}
