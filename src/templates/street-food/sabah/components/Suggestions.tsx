'use client';

import React, { useId, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, CupSoda, Flame, IceCreamCone, Plus, Soup } from 'lucide-react';
import { useSabah } from '../context';
import { currencyUnit, formatAmount } from '../money';
import type { MenuItem } from '../data/menuData';
import {
  SUGGESTION_GROUP_LABEL,
  defaultSuggestionGroup,
  suggestionGroups,
  type SuggestionGroupKey,
} from './suggestion-groups';

const GROUP_ICON: Record<SuggestionGroupKey, LucideIcon> = {
  drink: CupSoda,
  side: Soup,
  dessert: IceCreamCone,
  popular: Flame,
};

/**
 * Dishes the restaurant suggests — "often ordered together" in the dish sheet,
 * "complete your meal" in the cart. One tap adds one, without leaving the
 * sheet or the cart. When the suggestions span more than one kind they are
 * grouped into tabs (drinks, sides, desserts, popular).
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
  const tabRefs = useRef<Partial<Record<SuggestionGroupKey, HTMLButtonElement | null>>>({});
  const baseId = useId();

  if (dishes.length === 0) return null;

  const groups = suggestionGroups(dishes);
  const current = groups.find((group) => group.key === (picked ?? defaultSuggestionGroup(groups))) ?? groups[0];
  const shown = current ? current.dishes : dishes;
  const tabbed = groups.length > 1;

  // Arrow keys move between the tabs in reading order: forward is left in Arabic.
  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const keys = groups.map((group) => group.key);
    const index = Math.max(0, keys.indexOf(current?.key ?? keys[0] ?? 'popular'));
    const forward = isAr ? 'ArrowLeft' : 'ArrowRight';
    const back = isAr ? 'ArrowRight' : 'ArrowLeft';
    let target: number | null = null;
    if (event.key === forward) target = (index + 1) % keys.length;
    else if (event.key === back) target = (index - 1 + keys.length) % keys.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = keys.length - 1;
    const key = target === null ? undefined : keys[target];
    if (!key) return;
    event.preventDefault();
    setPicked(key);
    tabRefs.current[key]?.focus();
  };

  return (
    <section className="space-y-3" data-suggestions>
      <h4 className="text-sm font-black leading-relaxed text-emerald-300">{title}</h4>

      {tabbed ? (
        <div
          role="tablist"
          aria-label={title}
          className="flex gap-2 overflow-x-auto hide-scrollbar"
          data-suggestion-tabs
        >
          {groups.map((group) => {
            const selected = group.key === current?.key;
            const Icon = GROUP_ICON[group.key];
            const label = SUGGESTION_GROUP_LABEL[group.key];
            return (
              <button
                key={group.key}
                ref={(element) => {
                  tabRefs.current[group.key] = element;
                }}
                id={`${baseId}-tab-${group.key}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                data-tab={group.key}
                onClick={() => setPicked(group.key)}
                onKeyDown={onTabKey}
                className={`inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl text-sm font-bold whitespace-nowrap cursor-pointer border transition-colors ${
                  selected
                    ? 'bg-stone-100 text-stone-950 border-white'
                    : 'bg-stone-900/80 text-stone-300 border-emerald-950 hover:border-emerald-700 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{isAr ? label.ar : label.en}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        id={tabbed ? `${baseId}-panel` : undefined}
        role={tabbed ? 'tabpanel' : undefined}
        aria-labelledby={tabbed && current ? `${baseId}-tab-${current.key}` : undefined}
      >
        <ul className="space-y-2">
          {shown.map((dish) => {
            const done = added.includes(dish.id);
            const name = isAr ? dish.nameAr : dish.nameEn;
            return (
              <li
                key={dish.id}
                data-suggestion={dish.id}
                className="flex items-center gap-3 p-2.5 rounded-2xl border border-emerald-950 bg-stone-900/90"
              >
                {dish.image ? (
                  <img
                    src={dish.image}
                    srcSet={dish.imageSrcSet}
                    sizes="56px"
                    alt=""
                    loading="lazy"
                    className="w-14 h-14 rounded-xl object-cover shrink-0"
                  />
                ) : null}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-white truncate">{name}</span>
                  <span className="sf-price block mt-0.5 text-xs font-black text-amber-400 tabular-nums">
                    {formatAmount(dish.price, info.currency)} {currencyUnit(info.currency, isAr)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(dish);
                    setAdded((prev) => (prev.includes(dish.id) ? prev : [...prev, dish.id]));
                  }}
                  aria-label={`${isAr ? 'أضف' : 'Add'} ${name}`}
                  className={`shrink-0 inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                    done
                      ? 'bg-stone-800 text-emerald-300 border border-emerald-700'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {done ? <Check className="w-4 h-4" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
                  <span>{done ? (isAr ? 'أُضيف' : 'Added') : isAr ? 'أضف' : 'Add'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

/** The suggestions that can actually be ordered, in the restaurant's order. */
export function orderableSuggestions(codes: string[], dishes: MenuItem[], exclude: string[] = []): MenuItem[] {
  return codes
    .map((code) => dishes.find((dish) => dish.id === code))
    .filter((dish): dish is MenuItem => Boolean(dish && !dish.isUnavailable && !dish.noPrice && !exclude.includes(dish.id)));
}
