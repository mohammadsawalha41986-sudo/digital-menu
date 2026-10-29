'use client';

import React from 'react';
import { Search, X, Flame, Sparkles, Star, LayoutGrid, List, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Language } from '../types';

interface MenuSearchAndFilterProps {
  lang: Language;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFilter: 'all' | 'popular' | 'offers' | 'spicy';
  onFilterChange: (filter: 'all' | 'popular' | 'offers' | 'spicy') => void;
  resultCount: number;
  viewMode: 'grid' | 'list';
  onToggleViewMode: (mode: 'grid' | 'list') => void;
  onOpenCaloriesModal: () => void;
}

export const MenuSearchAndFilter: React.FC<MenuSearchAndFilterProps> = ({
  lang,
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  resultCount,
  viewMode,
  onToggleViewMode,
  onOpenCaloriesModal,
}) => {
  const isAr = lang === 'ar';

  return (
    <div className="py-5 border-b border-emerald-950/80 bg-[#0e140f]/70 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          
          {/* Search Input Box */}
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 text-emerald-400 absolute right-3.5 rtl:right-3.5 ltr:left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={isAr ? 'ابحث عن صنف...' : 'Search the menu...'}
              className="w-full bg-stone-950/90 border border-emerald-900/60 rounded-xl py-2.5 rtl:pr-10 rtl:pl-10 ltr:pl-10 ltr:pr-10 text-sm text-white placeholder-stone-400 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-colors shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute left-3 rtl:left-3 ltr:right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filter Buttons & View Mode Controls */}
          <div className="flex flex-wrap items-center gap-2 justify-between lg:justify-end">
            
            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => onFilterChange('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  activeFilter === 'all'
                    ? 'bg-stone-100 text-stone-950 border-white shadow-sm'
                    : 'bg-stone-900/80 hover:bg-stone-850 text-stone-300 border-emerald-950'
                }`}
              >
                {isAr ? 'الكل' : 'All'}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => onFilterChange('popular')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 border ${
                  activeFilter === 'popular'
                    ? 'bg-amber-500 text-stone-950 border-amber-300 shadow-sm shadow-amber-500/20'
                    : 'bg-stone-900/80 hover:bg-stone-850 text-stone-300 border-emerald-950'
                }`}
              >
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span>{isAr ? 'الأكثر طلباً' : 'Bestsellers'}</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => onFilterChange('offers')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 border ${
                  activeFilter === 'offers'
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white border-emerald-300 shadow-sm shadow-emerald-500/20'
                    : 'bg-stone-900/80 hover:bg-stone-850 text-stone-300 border-emerald-950'
                }`}
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>{isAr ? 'عروض التوفير' : 'Value Combos'}</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => onFilterChange('spicy')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 border ${
                  activeFilter === 'spicy'
                    ? 'bg-red-600 text-white border-red-400 shadow-sm'
                    : 'bg-stone-900/80 hover:bg-stone-850 text-stone-300 border-emerald-950'
                }`}
              >
                <Flame className="w-3 h-3 text-red-400" />
                <span>{isAr ? 'حار' : 'Spicy'}</span>
              </motion.button>
            </div>

            {/* Separator */}
            <div className="hidden sm:block w-px h-6 bg-emerald-950" />

            {/* View Mode Toggle & Calorie Table Trigger */}
            <div className="flex items-center gap-1.5">
              
              {/* Calorie Guide Button */}
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                onClick={onOpenCaloriesModal}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                title={isAr ? 'عرض جدول السعرات المعتمد' : 'View Calorie Guide'}
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isAr ? 'جدول السعرات' : 'Calories'}</span>
              </motion.button>

              {/* Grid / List View Toggle */}
              <div className="flex items-center bg-stone-900 border border-emerald-950 rounded-xl p-0.5">
                <button
                  onClick={() => onToggleViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-stone-400 hover:text-white'
                  }`}
                  title={isAr ? 'عرض الشبكة الكبيرة' : 'Grid View'}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onToggleViewMode('list')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-stone-400 hover:text-white'
                  }`}
                  title={isAr ? 'عرض القائمة الكلاسيكية' : 'Compact List View'}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

            </div>

          </div>

        </div>

        {/* Results Count Line */}
        <div className="flex items-center justify-between text-xs text-stone-400 pt-1">
          <span className="text-emerald-300/80 font-medium">
            {isAr ? `يعرض ${resultCount} صنفاً` : `Showing ${resultCount} items`}
          </span>
          <span className="text-stone-400">
            {isAr ? 'الأسعار شاملة ضريبة القيمة المضافة 15%' : 'All prices include 15% VAT'}
          </span>
        </div>

      </div>
    </div>
  );
};
