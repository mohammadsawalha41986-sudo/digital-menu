'use client';

import React, { useState } from 'react';
import { currencyUnit, formatAmount } from '../money';
import { useSabah } from '../context';
import { Plus, Flame, Sparkles, UtensilsCrossed } from 'lucide-react';
import type { MenuItem } from '../data/menuData';
import type { Language } from '../types';
import { SaleBadge, SaleUrgency, SaleWas } from './SaleTag';

interface MenuItemCardProps {
  item: MenuItem;
  lang: Language;
  onSelect: (item: MenuItem) => void;
  /**
   * `large` gives the photograph a taller frame for photo-led menus; `wide`
   * is a featured dish, drawn as a horizontal card at every width.
   *
   * Any card becomes horizontal (photo beside the text) when it sits in a
   * row cell (sabah.css, `.sf-row` and the grid's last lone card); the
   * `sf-card__*` classes are the hooks those styles use.
   */
  size?: 'regular' | 'large' | 'wide';
  /** Above the fold: load the photo at once and ahead of the others. */
  priority?: boolean;
  /** The width the card takes, for the browser's pick from `srcSet`, when the size alone does not say it. */
  sizes?: string;
}

/**
 * The width a card's photo is drawn at, matching the section grid
 * (sabah.css, `.sf-grid`): four columns of the 1400px menu on a wide screen,
 * three on a laptop, two on phones and tablets; below 360px every card is
 * horizontal, its photo beside the text. A wide card's photo is the side
 * frame of a horizontal card.
 */
const PHOTO_SIZES = {
  regular: '(min-width: 1280px) 340px, (min-width: 1024px) 33vw, (min-width: 360px) 50vw, 40vw',
  large: '(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw',
  wide: '(min-width: 1024px) 480px, 40vw',
} as const;

export const MenuItemCard: React.FC<MenuItemCardProps> = ({
  item,
  lang,
  onSelect,
  size = 'regular',
  priority = false,
  sizes,
}) => {
  const { currency } = useSabah().info;
  const isAr = lang === 'ar';
  // A photo that cannot be loaded gives way to a plain brand-tinted frame.
  const [photoFailed, setPhotoFailed] = useState(false);
  // Regular cards sit two-up on a phone, so below `sm` they keep to one
  // line of description and an icon-only button.
  const compact = size === 'regular';
  const wide = size === 'wide';
  const hasOptions = Boolean(item.options && item.options.length > 0);
  const chooses = Boolean(item.options || item.isSpicyOption || item.choices?.length);
  const actionLabel = chooses ? (isAr ? 'اختيار' : 'Choose') : isAr ? 'إضافة' : 'Add';
  const name = isAr ? item.nameAr : item.nameEn;

  return (
    <div
      // Stable hooks for tests and analytics: the item code, price and
      // calories as rendered.
      data-item={item.id}
      data-unavailable={item.isUnavailable ? '' : undefined}
      data-card-size={size}
      className={`sf-card group flex flex-col bg-stone-950/95 rounded-2xl border border-emerald-950/90 hover:border-emerald-500/60 overflow-hidden shadow-lg hover:shadow-xl hover:shadow-emerald-950/50 transition-[translate,box-shadow,border-color] duration-300 motion-safe:hover:-translate-y-1`}
    >
      {item.image ? (
        <div
          className={`sf-card-media relative w-full overflow-hidden bg-gradient-to-br from-emerald-950 to-stone-900 ${
            size === 'large' ? 'aspect-[4/3]' : 'aspect-[16/10]'
          }`}
        >
          {photoFailed ? (
            <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
              <UtensilsCrossed className="w-8 h-8 text-emerald-400/40" strokeWidth={1.5} />
            </div>
          ) : (
            <img
              // An image that failed before the page became interactive
              // never fires onError: catch it as the element mounts.
              ref={(img) => {
                if (img && img.complete && img.naturalWidth === 0) setPhotoFailed(true);
              }}
              src={item.image}
              // WebP widths from the upload; the browser picks the one the card needs.
              srcSet={item.imageSrcSet}
              sizes={sizes ?? PHOTO_SIZES[size]}
              style={{ objectPosition: item.imagePosition }}
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : undefined}
              decoding="async"
              alt={name}
              // Transparent text: a broken photo never flashes its alt text.
              className={`w-full h-full object-cover text-transparent group-hover:scale-108 transition-transform duration-500 ${item.isUnavailable ? 'grayscale opacity-60' : ''}`}
              referrerPolicy="no-referrer"
              onError={() => setPhotoFailed(true)}
            />
          )}

          {/* Badges */}
          <div className="absolute top-2 start-2 flex flex-wrap items-center gap-1.5 z-10">
            {item.sale ? <SaleBadge item={item} isAr={isAr} /> : null}
            {item.isOffer && !item.sale && (
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
            <div className="absolute top-2 end-2 z-10">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-red-950/90 text-red-200 border border-red-700/80 flex items-center gap-1 shadow">
                <Flame className="w-3 h-3 text-red-400" />
                <span className={compact ? 'hidden sm:inline' : undefined}>{isAr ? 'عادي أو حار' : 'Mild / Spicy'}</span>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="sf-card__stripe h-1.5 bg-gradient-to-r from-emerald-600 to-amber-500" />
      )}

      {/* Body: name, description, calories, then the price row at the foot. */}
      <div className={`sf-card__body flex-1 min-w-0 flex flex-col gap-1.5 ${compact ? 'p-3 sm:p-4' : 'p-4'}`}>
        <div className="flex items-start justify-between gap-2">
          <h3
            className={`${wide ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'} min-w-0 break-words font-bold text-white group-hover:text-amber-300 transition-colors leading-snug line-clamp-2`}
          >
            {name}
          </h3>
          {/* A dish without a photo has no image corner for the badge: it sits here instead. */}
          {!item.image && item.sale ? <SaleBadge item={item} isAr={isAr} /> : null}
          <SaleUrgency item={item} isAr={isAr} />
        </div>

        {item.descriptionAr || item.descriptionEn ? (
          <p
            className={`sf-card__desc text-stone-300 leading-snug ${
              wide ? 'text-sm sm:text-base line-clamp-2' : compact ? 'text-xs sm:text-sm line-clamp-1 sm:line-clamp-2' : 'text-sm line-clamp-2'
            }`}
          >
            {isAr ? item.descriptionAr : item.descriptionEn}
          </p>
        ) : null}

        {/* Calories stay visible at every size — menus are expected to show
            them wherever a dish is listed. Nothing is said about a dish the
            restaurant did not say itself. */}
        {item.calories || hasOptions ? (
          <div className={`flex items-center gap-2 ${compact ? 'text-[11px] sm:text-xs' : 'text-xs'} text-stone-400`}>
            {item.calories ? (
              <span className="tabular-nums font-mono text-emerald-300/90 font-medium" data-calories>
                {item.calories} {isAr ? 'سعرة' : 'kcal'}
              </span>
            ) : null}
            {item.calories && hasOptions ? (
              <span aria-hidden="true" className="hidden sm:inline text-stone-600">·</span>
            ) : null}
            {hasOptions ? (
              <span className={`${compact ? 'hidden sm:inline' : ''} text-amber-300/90 font-semibold`}>
                {isAr ? `${item.options!.length} أحجام` : `${item.options!.length} sizes`}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Price & action. `mt-auto` keeps the rows of a grid line aligned. */}
        <div className="sf-card__foot flex items-center justify-between gap-2 pt-1 mt-auto">
          {item.noPrice ? (
            <span />
          ) : (
            <div className="flex flex-col min-w-0">
              {/* Two-up cards have no room for the saving; drawn as a row they do (sabah.css). */}
              {item.sale ? (
                <SaleWas item={item} isAr={isAr} currency={currency} savingClassName={compact ? 'sf-card__saving' : undefined} />
              ) : null}
              {/* "From" changes what the price means, so it always shows. */}
              {hasOptions ? (
                <span className="text-[11px] leading-tight text-stone-400">{isAr ? 'يبدأ من' : 'From'}</span>
              ) : null}
              <div className="flex items-baseline gap-1">
                <span
                  className={`${compact ? 'text-base sm:text-xl' : 'text-xl'} font-black text-amber-400 tabular-nums tracking-tight sf-price`}
                  data-price
                >
                  {formatAmount(item.price, currency)}
                </span>
                <span className="text-xs font-bold text-emerald-400">{currencyUnit(currency, isAr)}</span>
              </div>
            </div>
          )}

          {item.noPrice && !item.isUnavailable ? null : item.isUnavailable ? (
            <span className="shrink-0 px-2.5 py-1.5 rounded-xl bg-stone-800 border border-stone-700 text-stone-300 text-[11px] sm:text-xs font-bold whitespace-nowrap">
              {isAr ? 'غير متوفر حالياً' : 'Currently unavailable'}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onSelect(item)}
              aria-label={actionLabel}
              className={`sf-card__action inline-flex shrink-0 items-center justify-center gap-1.5 h-11 ${
                compact ? 'w-11 rounded-full sm:w-auto sm:rounded-xl sm:px-4' : 'px-4 rounded-xl'
              } bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold text-sm shadow-md shadow-emerald-950/60 border border-emerald-400/30 transition-[transform,background-color] active:scale-95 cursor-pointer`}
            >
              <Plus className={`${compact ? 'w-5 h-5 sm:w-4 sm:h-4' : 'w-4 h-4'} stroke-[2.5]`} />
              <span className={`sf-card__label ${compact ? 'hidden sm:inline' : ''}`}>{actionLabel}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
