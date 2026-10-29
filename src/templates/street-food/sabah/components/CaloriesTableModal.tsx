'use client';

import React, { useState, useMemo } from 'react';
import { currencyUnit, formatAmount } from '../money';
import { X, Search, Activity, Flame, Info, Check, Filter } from 'lucide-react';
import { useSabah } from '../context';
import type { Language } from '../types';

interface CaloriesTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const CaloriesTableModal: React.FC<CaloriesTableModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const { items: MENU_ITEMS, categories: MENU_CATEGORIES } = useSabah();
  const { currency } = useSabah().info;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [calorieFilter, setCalorieFilter] = useState<'all' | 'low' | 'moderate' | 'high'>('all');

  // Filter items — the hook list stays identical whether the modal is open
  // or closed; the `isOpen` short-circuit sits after the hooks so React's
  // call order is deterministic across renders.
  const filteredItems = useMemo(() => {
    return MENU_ITEMS.filter((item) => {
      if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchAr = item.nameAr.toLowerCase().includes(q);
        const matchEn = item.nameEn.toLowerCase().includes(q);
        if (!matchAr && !matchEn) return false;
      }

      const cal = item.calories || 0;
      if (calorieFilter === 'low' && cal > 350) return false;
      if (calorieFilter === 'moderate' && (cal <= 350 || cal > 700)) return false;
      if (calorieFilter === 'high' && cal <= 700) return false;

      return true;
    });
  }, [searchQuery, selectedCategory, calorieFilter, MENU_ITEMS]);

  if (!isOpen) return null;

  const isAr = lang === 'ar';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-950/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl bg-[var(--sf-ink-0f1712)] border-2 border-emerald-500/40 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-emerald-950 via-[var(--sf-ink-111c14)] to-stone-950 border-b border-emerald-950 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-2xl font-black text-white flex items-center gap-2">
                <span>{isAr ? 'جدول السعرات الحرارية والقيمة الغذائية' : 'Calorie & Nutritional Guide'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/90 text-emerald-300 border border-emerald-400/40 font-bold">
                  {isAr ? 'معتمد SFDA' : 'SFDA Compliant'}
                </span>
              </h2>
              <p className="text-xs text-stone-300 mt-0.5">
                {isAr
                  ? 'قائمة مفصلة بالسعرات الحرارية وأسعار الوجبات'
                  : 'Calorie information for every menu item'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-stone-900 hover:bg-stone-850 text-stone-300 hover:text-white flex items-center justify-center border border-emerald-900 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SFDA Official Health Notice Banner */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-2.5 flex items-center gap-2.5 text-xs text-amber-300">
          <Info className="w-4 h-4 shrink-0 text-amber-400" />
          <p className="leading-relaxed">
            {isAr
              ? 'تنويه صحي: يحتاج البالغون إلى ما يقارب 2000 سعرة حرارية في المتوسط يومياً، وقد تختلف الاحتياجات الفردية حسب النشاط البدني والعمر.'
              : 'Nutritional Note: Adults need approximately 2,000 calories daily on average. Individual calorie needs may vary.'}
          </p>
        </div>

        {/* Search & Category Filter Strip */}
        <div className="p-4 bg-stone-950/70 border-b border-emerald-950/80 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-emerald-400 absolute right-3 rtl:right-3 ltr:left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'ابحث عن وجبة في جدول السعرات...' : 'Search dish in calorie table...'}
                className="w-full bg-stone-900 border border-emerald-900/60 rounded-xl py-2 rtl:pr-9 rtl:pl-4 ltr:pl-9 ltr:pr-4 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-emerald-400"
              />
            </div>

            {/* Calorie Range Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setCalorieFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  calorieFilter === 'all'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-stone-900 text-stone-300 hover:bg-stone-850'
                }`}
              >
                {isAr ? 'الكل' : 'All'}
              </button>
              <button
                onClick={() => setCalorieFilter('low')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  calorieFilter === 'low'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-stone-900 text-stone-300 hover:bg-stone-850'
                }`}
              >
                {isAr ? 'خفيف (< 350 سعرة)' : 'Light (<350 cal)'}
              </button>
              <button
                onClick={() => setCalorieFilter('moderate')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  calorieFilter === 'moderate'
                    ? 'bg-amber-500 text-stone-950'
                    : 'bg-stone-900 text-stone-300 hover:bg-stone-850'
                }`}
              >
                {isAr ? 'متوسط (350 - 700)' : 'Moderate (350-700)'}
              </button>
              <button
                onClick={() => setCalorieFilter('high')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  calorieFilter === 'high'
                    ? 'bg-red-600 text-white'
                    : 'bg-stone-900 text-stone-300 hover:bg-stone-850'
                }`}
              >
                {isAr ? 'وجبات مشبعة (> 700)' : 'Heavy (>700 cal)'}
              </button>
            </div>

          </div>

          {/* Categories Pill Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar text-xs">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-md whitespace-nowrap cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-amber-500 text-stone-950 font-bold'
                  : 'bg-stone-900 text-stone-400 hover:text-white'
              }`}
            >
              {isAr ? 'جميع الأقسام' : 'All Categories'}
            </button>
            {MENU_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-2.5 py-1 rounded-md whitespace-nowrap cursor-pointer ${
                  selectedCategory === c.id
                    ? 'bg-amber-500 text-stone-950 font-bold'
                    : 'bg-stone-900 text-stone-400 hover:text-white'
                }`}
              >
                {isAr ? c.nameAr : c.nameEn}
              </button>
            ))}
          </div>
        </div>

        {/* Calorie Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <table className="w-full text-right rtl:text-right ltr:text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-emerald-950 text-stone-400 text-xs uppercase font-bold">
                <th className="pb-3 px-3">{isAr ? 'الصنف' : 'Dish'}</th>
                <th className="pb-3 px-3">{isAr ? 'القسم' : 'Category'}</th>
                <th className="pb-3 px-3 text-center">{isAr ? 'السعرات الحرارية' : 'Calories'}</th>
                <th className="pb-3 px-3 text-left rtl:text-left ltr:text-right">{isAr ? 'السعر' : 'Price'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-950/40">
              {filteredItems.map((dish) => {
                const categoryObj = MENU_CATEGORIES.find((c) => c.id === dish.categoryId);
                const calories = dish.calories || 0;
                
                // Color badge according to calorie level
                let calColor = 'text-emerald-400 bg-emerald-950/80 border-emerald-500/30';
                if (calories > 700) {
                  calColor = 'text-red-400 bg-red-950/80 border-red-500/30';
                } else if (calories > 350) {
                  calColor = 'text-amber-400 bg-amber-950/80 border-amber-500/30';
                }

                return (
                  <tr key={dish.id} className="hover:bg-emerald-950/20 transition-colors">
                    {/* Name */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {dish.image && (
                          <img
                            src={dish.image}
                            alt=""
                            className="w-8 h-8 rounded-lg object-cover shrink-0 border border-stone-800"
                          />
                        )}
                        <div>
                          <span className="font-bold text-white block">
                            {isAr ? dish.nameAr : dish.nameEn}
                          </span>
                          {dish.options && dish.options.length > 0 && (
                            <span className="text-[10px] text-stone-400">
                              {dish.options.map((o) => `${isAr ? o.nameAr : o.nameEn} (${o.price} ر.س)`).join(' · ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-3 text-stone-400 text-xs">
                      {categoryObj ? (isAr ? categoryObj.nameAr : categoryObj.nameEn) : ''}
                    </td>

                    {/* Calories */}
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-flex items-center gap-1 font-mono font-bold text-xs px-2.5 py-1 rounded-lg border ${calColor} tabular-nums`}>
                        <Flame className="w-3 h-3" />
                        <span>{calories} {isAr ? 'سعرة' : 'kcal'}</span>
                      </span>
                    </td>

                    {/* Price */}
                    <td className="py-3 px-3 text-left rtl:text-left ltr:text-right font-black text-amber-400 tabular-nums">
                      {dish.noPrice ? '—' : `${formatAmount(dish.price, currency)} ${currencyUnit(currency, isAr)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredItems.length === 0 && (
            <div className="py-12 text-center text-stone-400 text-sm">
              {isAr ? 'لا توجد نتائج مطابقة لبحثك' : 'No items match your calorie filter'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-950 border-t border-emerald-950 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-400">
          <span>
            {isAr
              ? `إجمالي الأصناف المدرجة: ${filteredItems.length} صنفاً`
              : `Total items listed: ${filteredItems.length}`}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-xs hover:from-emerald-500 hover:to-emerald-400 transition-colors"
          >
            {isAr ? 'إغلاق والعودة للمنيو' : 'Close and Back to Menu'}
          </button>
        </div>

      </div>
    </div>
  );
};
