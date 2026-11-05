'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useSabah } from '../context';
import type { Language } from '../types';
import { 
  Sparkles, 
  Flame, 
  UtensilsCrossed, 
  Beef, 
  Sandwich, 
  Pizza, 
  Layers, 
  Salad, 
  Wine, 
  Coffee 
} from 'lucide-react';

interface CategoryNavProps {
  lang: Language;
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
}

export const CategoryNav: React.FC<CategoryNavProps> = ({
  lang,
  selectedCategory,
  onSelectCategory,
}) => {
  const { categories: MENU_CATEGORIES } = useSabah();
  const isAr = lang === 'ar';
  const railRef = useRef<HTMLDivElement>(null);

  // The active chip stays in view inside the horizontal rail.
  useEffect(() => {
    // Only the rail scrolls, sideways; the page itself never moves for this.
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!rail || !chip) return;
    const box = rail.getBoundingClientRect();
    const at = chip.getBoundingClientRect();
    if (at.left < box.left) rail.scrollBy({ left: at.left - box.left - 16 });
    else if (at.right > box.right) rail.scrollBy({ left: at.right - box.right + 16 });
  }, [selectedCategory]);

  const renderIcon = (id: string, isSelected: boolean) => {
    const iconClass = isSelected ? 'w-4 h-4 text-stone-950 stroke-[2.5]' : 'w-4 h-4';
    switch (id) {
      case 'combos':
        return <Sparkles className={`${iconClass} ${isSelected ? '' : 'text-amber-400'}`} />;
      case 'shawarma':
        return <Flame className={`${iconClass} ${isSelected ? '' : 'text-orange-400'}`} />;
      case 'broasted':
        return <UtensilsCrossed className={`${iconClass} ${isSelected ? '' : 'text-amber-400'}`} />;
      case 'grills':
        return <Beef className={`${iconClass} ${isSelected ? '' : 'text-red-400'}`} />;
      case 'sandwiches':
        return <Sandwich className={`${iconClass} ${isSelected ? '' : 'text-yellow-400'}`} />;
      case 'burgers':
        return <UtensilsCrossed className={`${iconClass} ${isSelected ? '' : 'text-emerald-400'}`} />;
      case 'pizza':
        return <Pizza className={`${iconClass} ${isSelected ? '' : 'text-rose-400'}`} />;
      case 'potatoes':
        return <Layers className={`${iconClass} ${isSelected ? '' : 'text-amber-300'}`} />;
      case 'appetizers':
        return <Salad className={`${iconClass} ${isSelected ? '' : 'text-emerald-400'}`} />;
      case 'juices':
        return <Wine className={`${iconClass} ${isSelected ? '' : 'text-pink-400'}`} />;
      case 'beverages':
        return <Coffee className={`${iconClass} ${isSelected ? '' : 'text-cyan-400'}`} />;
      default:
        return <Flame className={`${iconClass} ${isSelected ? '' : 'text-amber-400'}`} />;
    }
  };

  return (
    <div data-sticky-bar className="sticky top-14 sm:top-18 z-30 bg-[var(--sf-ink-0d120e)]/95 backdrop-blur-md border-b border-emerald-950/80 py-2 sm:py-3 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div ref={railRef} data-category-rail className="flex items-center gap-2 overflow-x-auto p-1 scrollbar-none hide-scrollbar">
          
          {/* 'All Items' Tab with motion */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            type="button"
            aria-pressed={selectedCategory === 'all'}
            onClick={() => onSelectCategory('all')}
            className={`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 relative px-4 py-2 sm:py-2.5 rounded-full sm:rounded-xl text-[13px] sm:text-sm font-black whitespace-nowrap shrink-0 transition-all cursor-pointer flex items-center gap-2 border ${
              selectedCategory === 'all'
                ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-stone-950 border-amber-300 shadow-md shadow-amber-500/30'
                : 'bg-stone-900/90 hover:bg-stone-850 text-stone-300 hover:text-white border-emerald-950 hover:border-emerald-700/60'
            }`}
          >
            <span>{isAr ? 'جميع الأقسام' : 'All Menu'}</span>
          </motion.button>

          {/* Individual Categories */}
          {MENU_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <motion.button
                key={cat.id}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                aria-pressed={isSelected}
                title={isAr ? cat.nameAr : cat.nameEn}
                onClick={() => onSelectCategory(cat.id)}
                className={`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 relative max-w-[16rem] px-3.5 py-2 sm:py-2.5 rounded-full sm:rounded-xl text-[13px] sm:text-sm font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer flex items-center gap-2 border ${
                  isSelected
                    ? 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 text-stone-950 border-emerald-300 shadow-md shadow-emerald-500/25'
                    : 'bg-stone-900/90 hover:bg-stone-850 text-stone-300 hover:text-white border-emerald-950 hover:border-emerald-700/60'
                }`}
              >
                {renderIcon(cat.id, isSelected)}
                <span className="truncate">{isAr ? cat.nameAr : cat.nameEn}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
