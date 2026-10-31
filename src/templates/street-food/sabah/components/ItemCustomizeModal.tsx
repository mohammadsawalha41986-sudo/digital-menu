'use client';

import React, { useState } from 'react';
import { currencyUnit, formatAmount } from '../money';
import { useSabah } from '../context';
import { Suggestions, orderableSuggestions } from './Suggestions';
import { X, Plus, Minus, Flame, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuItem } from '../data/menuData';
import type { Language, CartItem } from '../types';
import { chosen, defaultSelection, isSingle, missing, priceWith, selectionKey, toggle, type Selection } from '../choices';

interface ItemCustomizeModalProps {
  item: MenuItem | null;
  lang: Language;
  onClose: () => void;
  onAddToCart: (cartItem: CartItem) => void;
  /** Adds a suggested dish as it is, without closing the sheet. */
  onQuickAdd?: (dish: MenuItem) => void;
}

export const ItemCustomizeModal: React.FC<ItemCustomizeModalProps> = ({
  item,
  lang,
  onClose,
  onAddToCart,
  onQuickAdd,
}) => {
  const { info: { currency }, items: MENU_ITEMS } = useSabah();
  const [selectedOption, setSelectedOption] = useState(
    item && item.options && item.options.length > 0 ? item.options[0] : undefined,
  );
  const [spiceLevel, setSpiceLevel] = useState<'normal' | 'spicy'>('normal');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(item?.choices ?? []));
  const [showMissing, setShowMissing] = useState(false);

  if (!item) return null;

  const isAr = lang === 'ar';

  // Compute base unit price
  const basePrice = selectedOption ? selectedOption.price : item.price;
  // The restaurant's own choices: each chosen option adds its difference.
  const groups = item.choices ?? [];
  const picks = chosen(groups, selection);
  const unanswered = missing(groups, selection);
  const unitPrice = priceWith(basePrice, picks);
  const totalPrice = Math.round(unitPrice * quantity * 1000) / 1000;
  // The size-like group — the first required single choice whose options
  // cost differently — lists full prices (medium 15, large 20). Every other
  // group shows what it adds, since its full price depends on the size.
  const priceSetter = groups.find(
    (group) => isSingle(group) && group.min > 0 && new Set(group.options.map((option) => option.price)).size > 1,
  )?.key;

  const handleAdd = () => {
    if (unanswered.length > 0) {
      // Point at the first choice still to make instead of adding a dish the
      // restaurant cannot prepare as ordered.
      setShowMissing(true);
      document.getElementById(`choice-${unanswered[0]?.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const cartItemId = `${item.id}-${selectedOption?.nameAr || 'std'}-${selectionKey(picks)}-${spiceLevel}-${Date.now()}`;

    onAddToCart({
      cartItemId,
      item,
      selectedOption,
      choices: picks.length > 0 ? picks : undefined,
      spiceLevel: item.isSpicyOption ? spiceLevel : undefined,
      notes: notes.trim() || undefined,
      quantity,
      unitPrice,
      totalPrice,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/85 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-[var(--sf-ink-111913)] border-2 border-emerald-500/40 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          
          {/* Header with appetizing dish image */}
          <div className="relative aspect-[16/9] w-full bg-stone-950">
            {item.image ? (
              <img
                src={item.image}
                alt={isAr ? item.nameAr : item.nameEn}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-stone-900 text-stone-500">
                <Sparkles className="w-12 h-12 text-amber-500/30" />
              </div>
            )}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="absolute top-4 left-4 rtl:left-4 ltr:right-4 w-9 h-9 rounded-full bg-stone-950/80 hover:bg-stone-900 text-stone-200 hover:text-white flex items-center justify-center border border-emerald-500/40 transition-colors cursor-pointer shadow-lg"
            >
              <X className="w-5 h-5" />
            </motion.button>

          </div>

          {/* The name sits under the photo, so the photo needs no shade. */}
          <div className="px-4 sm:px-5 pt-4">
            <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
              {isAr ? item.nameAr : item.nameEn}
            </h2>
            {item.calories && (
              <span className="text-xs text-amber-300 font-mono mt-0.5 block font-semibold">
                {item.calories} {isAr ? 'سعرة حرارية تقريبية' : 'estimated calories'}
              </span>
            )}
          </div>

          {/* Scrollable Body */}
          <div className="p-5 overflow-y-auto space-y-5 flex-1">
            {/* Description */}
            {(item.descriptionAr || item.descriptionEn) && (
              <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
                {isAr ? item.descriptionAr : item.descriptionEn}
              </p>
            )}

            {/* Size / Option Selector (if applicable) */}
            {item.options && item.options.length > 0 && (
              <div className="space-y-2.5">
                <label className="text-xs font-black text-emerald-300 block uppercase tracking-wider">
                  {isAr ? 'اختر الحجم أو النوع' : 'Select Size or Option'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {item.options.map((opt, idx) => {
                    const isSelected = selectedOption?.nameAr === opt.nameAr;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedOption(opt)}
                        className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-950/80 border-emerald-400 text-white shadow-md shadow-emerald-950'
                            : 'bg-stone-900/90 border-emerald-950 text-stone-300 hover:border-emerald-700/60'
                        }`}
                      >
                        <span className="block text-xs sm:text-sm font-bold">
                          {isAr ? opt.nameAr : opt.nameEn}
                        </span>
                        <span className="block text-xs font-black text-amber-400 mt-1 tabular-nums">
                          {formatAmount(opt.price, currency)} {currencyUnit(currency, isAr)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* The restaurant's choices: size, rice, extras, swaps */}
            {groups.map((group) => {
              const picked = selection[group.key] ?? [];
              const needsAnswer = showMissing && unanswered.some((entry) => entry.key === group.key);
              const fullPrice = group.key === priceSetter;
              return (
                <fieldset key={group.key} id={`choice-${group.key}`} className="space-y-2.5" data-choice-group={group.key}>
                  <legend className="w-full flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-xs font-black text-emerald-300 uppercase tracking-wider">
                      {isAr ? group.nameAr : group.nameEn}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                        needsAnswer
                          ? 'border-red-500 text-red-300 bg-red-950/60'
                          : 'border-emerald-900 text-stone-400'
                      }`}
                      data-choice-rule
                    >
                      {group.min > 0
                        ? isSingle(group)
                          ? isAr ? 'إجباري · اختر واحداً' : 'Required · pick one'
                          : isAr ? `إجباري · ${group.min} على الأقل` : `Required · at least ${group.min}`
                        : isSingle(group)
                          ? isAr ? 'اختياري' : 'Optional'
                          : isAr ? `اختياري · حتى ${group.max}` : `Optional · up to ${group.max}`}
                    </span>
                  </legend>
                  <div className={isSingle(group) ? 'grid grid-cols-2 sm:grid-cols-3 gap-2' : 'space-y-2'}>
                    {group.options.map((option) => {
                      const on = picked.includes(option.key);
                      const full = !fullPrice && !isSingle(group) && !on && picked.length >= group.max;
                      const priceLabel = fullPrice
                        ? `${formatAmount(basePrice + option.price, currency)} ${currencyUnit(currency, isAr)}`
                        : option.price !== 0
                          ? `${option.price > 0 ? '+' : '−'}${formatAmount(Math.abs(option.price), currency)} ${currencyUnit(currency, isAr)}`
                          : null;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          role={isSingle(group) ? 'radio' : 'checkbox'}
                          aria-checked={on}
                          aria-disabled={full || undefined}
                          data-choice={option.key}
                          onClick={() => setSelection((current) => toggle(current, group, option.key))}
                          className={`w-full rounded-2xl border transition-all cursor-pointer ${
                            isSingle(group) ? 'p-3 text-center' : 'px-3.5 py-2.5 flex items-center justify-between gap-3 text-start'
                          } ${
                            on
                              ? 'bg-emerald-950/80 border-emerald-400 text-white shadow-md shadow-emerald-950'
                              : full
                                ? 'bg-stone-900/60 border-emerald-950 text-stone-500'
                                : 'bg-stone-900/90 border-emerald-950 text-stone-300 hover:border-emerald-700/60'
                          }`}
                        >
                          {isSingle(group) ? null : (
                            <span
                              aria-hidden="true"
                              className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center text-[12px] font-black ${
                                on ? 'bg-emerald-500 border-emerald-400 text-stone-950' : 'border-stone-600'
                              }`}
                            >
                              {on ? '✓' : ''}
                            </span>
                          )}
                          <span className={`${isSingle(group) ? 'block' : 'flex-1'} text-xs sm:text-sm font-bold`}>
                            {isAr ? option.nameAr : option.nameEn}
                          </span>
                          {priceLabel ? (
                            <span className={`${isSingle(group) ? 'block mt-1' : ''} text-xs font-black text-amber-400 tabular-nums`}>
                              {priceLabel}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}

            {/* Spice Level (if applicable) */}
            {item.isSpicyOption && (
              <div className="space-y-2.5">
                <label className="text-xs font-black text-emerald-300 block uppercase tracking-wider">
                  {isAr ? 'درجة الحرارة والنكهة' : 'Spice Level'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSpiceLevel('normal')}
                    className={`py-2.5 px-3 rounded-2xl border text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      spiceLevel === 'normal'
                        ? 'bg-stone-850 border-emerald-400 text-white shadow-sm'
                        : 'bg-stone-900 border-emerald-950 text-stone-400 hover:border-emerald-800'
                    }`}
                  >
                    {isAr ? 'عادي (غير حار)' : 'Normal (Mild)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpiceLevel('spicy')}
                    className={`py-2.5 px-3 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      spiceLevel === 'spicy'
                        ? 'bg-red-950/90 border-red-500 text-red-200 shadow-sm'
                        : 'bg-stone-900 border-emerald-950 text-stone-400 hover:border-emerald-800'
                    }`}
                  >
                    <Flame className="w-4 h-4 text-red-400" />
                    <span>{isAr ? 'حار (سبايسي)' : 'Spicy'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Complete your meal — the restaurant's own suggestions */}
            {onQuickAdd ? (
              <Suggestions
                title={isAr ? 'يكمل وجبتك' : 'Complete your meal'}
                dishes={orderableSuggestions(item.pairsWith ?? [], MENU_ITEMS, [item.id])}
                isAr={isAr}
                onAdd={onQuickAdd}
              />
            ) : null}

            {/* Special Instructions */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-bold text-stone-300 block">
                {isAr ? 'ملاحظات خاصة للطلب (اختياري)' : 'Special Requests (Optional)'}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isAr ? 'مثال: بدون مخلل، خبز محمر مقرمش، ثومية زيادة...' : 'e.g., No pickles, extra toasted, extra crispy...'}
                className="w-full bg-stone-950 border border-emerald-950 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-stone-400 focus:outline-none focus:border-emerald-400"
              />
            </div>

          </div>

          {/* Footer with Quantity & Add Button */}
          <div className="p-4 bg-stone-950 border-t border-emerald-950 flex items-center justify-between gap-4">
            
            {/* Quantity Stepper */}
            <div className="flex items-center bg-stone-900 border border-emerald-950 rounded-xl p-1 shrink-0">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-750 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-10 text-center font-black text-white text-sm tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-750 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Add to Cart CTA with Motion */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={handleAdd}
              className="flex-1 flex items-center justify-between px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-stone-950 font-black text-sm shadow-xl shadow-amber-500/25 border border-amber-300 transition-all cursor-pointer"
            >
              <span>
                {unanswered.length > 0 && showMissing
                  ? isAr
                    ? `اختر ${unanswered[0]?.nameAr}`
                    : `Choose ${unanswered[0]?.nameEn}`
                  : isAr
                    ? 'إضافة إلى الطلب'
                    : 'Add to Order'}
              </span>
              <span className="tabular-nums">
                {formatAmount(totalPrice, currency)} {currencyUnit(currency, isAr)}
              </span>
            </motion.button>

          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
