'use client';

import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MenuItemCard } from './MenuItemCard';
import { MenuItemRow } from './MenuItemRow';
import type { CardRun, SectionLayout } from '../section-layout';
import type { MenuItem } from '../data/menuData';
import type { Language } from '../types';

interface SectionDishesProps {
  layout: SectionLayout;
  dishes: MenuItem[];
  lang: Language;
  onSelect: (item: MenuItem) => void;
  /** How many of the first dishes are above the fold: their photos load first. */
  eager?: number;
}

/** One section's dishes, drawn the way its layout says. */
export const SectionDishes: React.FC<SectionDishesProps> = ({ layout, dishes, lang, onSelect, eager = 0 }) => {
  switch (layout.kind) {
    case 'list':
      return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4" data-section-layout="list">
          {dishes.map((dish) => (
            <MenuItemRow key={dish.id} item={dish} lang={lang} onSelect={onSelect} />
          ))}
        </div>
      );
    case 'carousel':
      return <Carousel dishes={dishes} lang={lang} onSelect={onSelect} eager={eager} />;
    case 'featured': {
      const [lead, ...rest] = dishes;
      if (!lead) return null;
      return (
        <div className="space-y-3 md:space-y-4 lg:space-y-6" data-section-layout="featured">
          {/* A section's only dish is not stretched across a wide screen. */}
          <div className={layout.rest ? undefined : 'lg:max-w-3xl'}>
            <MenuItemCard item={lead} lang={lang} size="wide" onSelect={onSelect} priority={eager > 0} />
          </div>
          {layout.rest ? (
            <Run run={layout.rest} dishes={rest} lang={lang} onSelect={onSelect} eager={Math.max(0, eager - 1)} />
          ) : null}
        </div>
      );
    }
    default:
      return <Run run={layout} dishes={dishes} lang={lang} onSelect={onSelect} eager={eager} />;
  }
};

function Run({ run, dishes, lang, onSelect, eager = 0 }: { run: CardRun } & Omit<SectionDishesProps, 'layout'>) {
  const large = run.kind === 'large';
  return (
    <div
      data-section-layout={run.kind}
      className={`grid ${large ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : run.columns} gap-3 md:gap-4 lg:gap-6`}
    >
      {dishes.map((dish, index) => (
        <MenuItemCard
          key={dish.id}
          item={dish}
          lang={lang}
          size={large ? 'large' : 'regular'}
          onSelect={onSelect}
          priority={index < eager}
        />
      ))}
    </div>
  );
}

function Carousel({ dishes, lang, onSelect, eager = 0 }: Omit<SectionDishesProps, 'layout'>) {
  const track = useRef<HTMLDivElement>(null);
  const isAr = lang === 'ar';

  // One card's width per press. In a right-to-left page "forward" scrolls
  // toward negative offsets, so the step follows the reading direction.
  const step = (forward: boolean) => {
    const element = track.current;
    if (!element) return;
    const card = element.firstElementChild as HTMLElement | null;
    const distance = (card?.offsetWidth ?? element.clientWidth) + 16;
    const rtl = getComputedStyle(element).direction === 'rtl';
    element.scrollBy({ left: (forward !== rtl ? 1 : -1) * distance, behavior: 'smooth' });
  };

  return (
    <div className="relative" data-section-layout="carousel">
      <div ref={track} className="sf-carousel" role="list">
        {dishes.map((dish, index) => (
          <div key={dish.id} role="listitem" className="flex [&>*]:flex-1">
            <MenuItemCard
              item={dish}
              lang={lang}
              size="regular"
              onSelect={onSelect}
              priority={index < eager}
              // The slide widths in sabah.css (.sf-carousel > *).
              sizes="(min-width: 1024px) 30vw, (min-width: 640px) 42vw, 75vw"
            />
          </div>
        ))}
      </div>
      {/* Phones swipe; a mouse gets buttons. */}
      <div className="hidden lg:flex absolute -top-14 end-0 gap-2">
        <button
          type="button"
          onClick={() => step(false)}
          aria-label={isAr ? 'السابق' : 'Previous'}
          className="sf-action w-10 h-10 rounded-full bg-stone-900 border border-emerald-900 text-white inline-flex items-center justify-center hover:border-emerald-500 cursor-pointer"
        >
          {isAr ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={() => step(true)}
          aria-label={isAr ? 'التالي' : 'Next'}
          className="sf-action w-10 h-10 rounded-full bg-stone-900 border border-emerald-900 text-white inline-flex items-center justify-center hover:border-emerald-500 cursor-pointer"
        >
          {isAr ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
