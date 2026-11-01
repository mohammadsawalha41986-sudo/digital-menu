'use client';

import React, { useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { useSabah } from '../context';
import { currencyUnit, formatAmount } from '../money';
import type { MenuItem } from '../data/menuData';
import {
  SUGGESTION_GROUP_LABEL,
  defaultSuggestionGroup,
  suggestionGroups,
  type SuggestionGroupKey,
} from './suggestion-groups';

/**
 * Dishes the restaurant suggests — "complete your meal" in the dish sheet,
 * "you may also like" in the cart. One tap adds one, without leaving the
 * sheet or the cart. Suggestions are grouped into tabs (drinks, sides,
 * desserts, popular) when they span more than one kind.
 */
export const Suggestions: React.FC<{
  title: string;
  dishes: MenuItem[];
  isAr: boolean;
  onAdd: (dish: MenuItem) => void;
}> = ({ title, dishes, isAr, onAdd }) => {
  const { info } = useSabah();
  const [added, setAdded] = useState<string[]>([]);
  const [picked, setPicked] = useState<SuggestionGroupKey | null>(null);

  if (dishes.length === 0) return null;

  const groups = suggestionGroups(dishes);
  const current = groups.find((group) => group.key === (picked ?? defaultSuggestionGroup(groups))) ?? groups[0];
  const shown = current ? current.dishes : dishes;

  return (
    <section className="space-y-2.5" data-suggestions>
      <h4 className="text-xs font-black text-emerald-300 uppercase tracking-wider">{title}</h4>
      {groups.length > 1 ? (
        <div role="tablist" aria-label={title} className="flex gap-1.5 overflow-x-auto hide-scrollbar" data-suggestion-tabs>
          {groups.map((group) => {
            const selected = group.key === current?.key;
            return (
              <button
                key={group.key}
                type="button"
                role="tab"
                aria-selected={selected}
                data-tab={group.key}
                onClick={() => setPicked(group.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer border transition-all ${
                  selected
                    ? 'bg-stone-100 text-stone-950 border-white'
                    : 'bg-stone-900/80 text-stone-300 border-emerald-950 hover:bg-stone-850'
                }`}
              >
                {isAr ? SUGGESTION_GROUP_LABEL[group.key].ar : SUGGESTION_GROUP_LABEL[group.key].en}
              </button>
            );
          })}
        </div>
      ) : null}
      <ul className="space-y-2">
        {shown.map((dish) => {
          const done = added.includes(dish.id);
          return (
            <li
              key={dish.id}
              data-suggestion={dish.id}
              className="flex items-center gap-3 p-2 rounded-2xl border border-emerald-950 bg-stone-900/90"
            >
              {dish.image ? (
                <img
                  src={dish.image}
                  srcSet={dish.imageSrcSet}
                  sizes="48px"
                  alt=""
                  loading="lazy"
                  className="w-12 h-12 rounded-xl object-cover shrink-0"
                />
              ) : null}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-white truncate">{isAr ? dish.nameAr : dish.nameEn}</span>
                <span className="sf-price text-xs font-black text-amber-400 tabular-nums">
                  {formatAmount(dish.price, info.currency)} {currencyUnit(info.currency, isAr)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onAdd(dish);
                  setAdded((prev) => [...prev, dish.id]);
                }}
                aria-label={`${isAr ? 'أضف' : 'Add'} ${isAr ? dish.nameAr : dish.nameEn}`}
                className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
              >
                {done ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                <span>{done ? (isAr ? 'أُضيف' : 'Added') : isAr ? 'أضف' : 'Add'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** The suggestions that can actually be ordered, in the restaurant's order. */
export function orderableSuggestions(codes: string[], dishes: MenuItem[], exclude: string[] = []): MenuItem[] {
  return codes
    .map((code) => dishes.find((dish) => dish.id === code))
    .filter((dish): dish is MenuItem => Boolean(dish && !dish.isUnavailable && !dish.noPrice && !exclude.includes(dish.id)));
}
