'use client';

import React from 'react';
import { Plus, Flame, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MenuItem } from '../data/menuData';
import type { Language } from '../types';

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
  const isAr = lang === 'ar';

  return (
    <motion.div
      // Stable hooks for tests and analytics: the item code, price and
      // calories as rendered.
      data-item={item.id}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={{ x: isAr ? -4 : 4 }}
      className="p-3.5 sm:p-4 rounded-2xl bg-stone-950/80 border border-emerald-950/90 hover:border-emerald-500/50 flex items-center justify-between gap-3 sm:gap-4 transition-all shadow-sm group"
    >
      {/* Thumbnail */}
      {item.image && (
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-stone-900 shrink-0 border border-emerald-950 group-hover:border-amber-400/40 transition-colors">
          <img
            src={item.image}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {/* Item info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-amber-300 transition-colors truncate">
            {isAr ? item.nameAr : item.nameEn}
          </h3>
          {item.isOffer && (
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

        <div className="flex items-center gap-2 text-[11px] text-stone-400">
          {item.calories && (
            <>
              <span className="font-mono text-emerald-400 font-medium" data-calories>{item.calories} {isAr ? 'سعرة' : 'cal'}</span>
              <span>·</span>
            </>
          )}
          {item.options && item.options.length > 0 ? (
            <span className="text-amber-300 font-medium">
              {dishOptionsSummary(item, isAr)}
            </span>
          ) : (
            <span className="text-stone-400">{isAr ? 'تحضير طازج' : 'Freshly made'}</span>
          )}
        </div>
      </div>

      {/* Price & Add */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right rtl:text-right ltr:text-left">
          <span className="text-base sm:text-lg font-black text-amber-400 tabular-nums" data-price>
            {item.price.toFixed(2)}
          </span>
          <span className="text-xs font-bold text-emerald-400 mr-1 ml-1">
            {isAr ? 'ر.س' : 'SAR'}
          </span>
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => onSelect(item)}
          className="p-2 sm:px-3 sm:py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-emerald-950 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span className="hidden sm:inline">
            {item.options ? (isAr ? 'اختيار' : 'Choose') : (isAr ? 'إضافة' : 'Add')}
          </span>
        </motion.button>
      </div>
    </motion.div>
  );
};

function dishOptionsSummary(item: MenuItem, isAr: boolean) {
  if (!item.options) return '';
  return item.options.map((o) => (isAr ? o.nameAr : o.nameEn)).join(' / ');
}
