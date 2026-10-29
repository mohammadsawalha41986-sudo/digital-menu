'use client';

import React, { useState } from 'react';
import { X, Plus, Minus, Flame, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuItem } from '../data/menuData';
import type { Language, CartItem } from '../types';

interface ItemCustomizeModalProps {
  item: MenuItem | null;
  lang: Language;
  onClose: () => void;
  onAddToCart: (cartItem: CartItem) => void;
}

export const ItemCustomizeModal: React.FC<ItemCustomizeModalProps> = ({
  item,
  lang,
  onClose,
  onAddToCart,
}) => {
  const [selectedOption, setSelectedOption] = useState(
    item && item.options && item.options.length > 0 ? item.options[0] : undefined,
  );
  const [spiceLevel, setSpiceLevel] = useState<'normal' | 'spicy'>('normal');
  const [extraCheese, setExtraCheese] = useState(false);
  const [extraGarlic, setExtraGarlic] = useState(false);
  const [extraSpicyGarlic, setExtraSpicyGarlic] = useState(false);
  const [extraHummus, setExtraHummus] = useState(false);
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);

  if (!item) return null;

  const isAr = lang === 'ar';

  // Compute base unit price
  const basePrice = selectedOption ? selectedOption.price : item.price;
  const cheesePrice = extraCheese ? 1.00 : 0;
  const garlicPrice = extraGarlic ? 2.00 : 0;
  const spicyGarlicPrice = extraSpicyGarlic ? 2.00 : 0;
  const hummusPrice = extraHummus ? 2.00 : 0;

  const unitPrice = basePrice + cheesePrice + garlicPrice + spicyGarlicPrice + hummusPrice;
  const totalPrice = unitPrice * quantity;

  const handleAdd = () => {
    const cartItemId = `${item.id}-${selectedOption?.nameAr || 'std'}-${spiceLevel}-${extraCheese ? 'ch' : ''}-${extraGarlic ? 'g' : ''}-${extraSpicyGarlic ? 'sg' : ''}-${extraHummus ? 'h' : ''}-${Date.now()}`;
    
    onAddToCart({
      cartItemId,
      item,
      selectedOption,
      spiceLevel: item.isSpicyOption ? spiceLevel : undefined,
      extraCheese,
      extraGarlic,
      extraSpicyGarlic,
      extraHummus,
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
                className="w-full h-full object-cover filter brightness-[1.03] contrast-[1.04]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-stone-900 text-stone-500">
                <Sparkles className="w-12 h-12 text-amber-500/30" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--sf-ink-111913)] via-[var(--sf-ink-111913)]/40 to-transparent" />
            
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="absolute top-4 left-4 rtl:left-4 ltr:right-4 w-9 h-9 rounded-full bg-stone-950/80 hover:bg-stone-900 text-stone-200 hover:text-white flex items-center justify-center border border-emerald-500/40 transition-colors cursor-pointer shadow-lg"
            >
              <X className="w-5 h-5" />
            </motion.button>

            <div className="absolute bottom-3 right-4 rtl:right-4 ltr:left-4 left-4">
              <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">
                {isAr ? item.nameAr : item.nameEn}
              </h2>
              {item.calories && (
                <span className="text-xs text-amber-300 font-mono mt-0.5 block font-semibold">
                  {item.calories} {isAr ? 'سعرة حرارية تقريبية' : 'estimated calories'}
                </span>
              )}
            </div>
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
                          {opt.price.toFixed(2)} {isAr ? 'ر.س' : 'SAR'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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

            {/* Extra Add-ons */}
            <div className="space-y-2.5">
              <label className="text-xs font-black text-emerald-300 block uppercase tracking-wider">
                {isAr ? 'إضافات وصوصات لذيذة' : 'Extra Add-ons & Sauces'}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                
                <label className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-colors ${
                  extraCheese ? 'bg-amber-500/15 border-amber-400 text-white' : 'bg-stone-900/90 border-emerald-950 text-stone-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={extraCheese}
                      onChange={(e) => setExtraCheese(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold">{isAr ? 'إضافة جبن شيدر' : 'Extra Cheddar'}</span>
                  </div>
                  <span className="text-xs font-black text-amber-400 tabular-nums">+1.00 {isAr ? 'ر.س' : 'SAR'}</span>
                </label>

                <label className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-colors ${
                  extraGarlic ? 'bg-emerald-500/15 border-emerald-400 text-white' : 'bg-stone-900/90 border-emerald-950 text-stone-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={extraGarlic}
                      onChange={(e) => setExtraGarlic(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-bold">{isAr ? 'ثومية إضافية' : 'Extra Garlic Dip'}</span>
                  </div>
                  <span className="text-xs font-black text-amber-400 tabular-nums">+2.00 {isAr ? 'ر.س' : 'SAR'}</span>
                </label>

                <label className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-colors ${
                  extraSpicyGarlic ? 'bg-red-500/15 border-red-500 text-white' : 'bg-stone-900/90 border-emerald-950 text-stone-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={extraSpicyGarlic}
                      onChange={(e) => setExtraSpicyGarlic(e.target.checked)}
                      className="w-4 h-4 rounded text-red-500 focus:ring-red-500"
                    />
                    <span className="text-xs font-bold">{isAr ? 'ثومية سبايسي حارة' : 'Spicy Garlic Dip'}</span>
                  </div>
                  <span className="text-xs font-black text-amber-400 tabular-nums">+2.00 {isAr ? 'ر.س' : 'SAR'}</span>
                </label>

                <label className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-colors ${
                  extraHummus ? 'bg-emerald-500/15 border-emerald-400 text-white' : 'bg-stone-900/90 border-emerald-950 text-stone-300'
                }`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={extraHummus}
                      onChange={(e) => setExtraHummus(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-bold">{isAr ? 'حمص صغير إضافي' : 'Extra Small Hummus'}</span>
                  </div>
                  <span className="text-xs font-black text-amber-400 tabular-nums">+2.00 {isAr ? 'ر.س' : 'SAR'}</span>
                </label>

              </div>
            </div>

            {/* Special Instructions */}
            <div className="space-y-1.5">
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
              <span>{isAr ? 'إضافة إلى الطلب' : 'Add to Order'}</span>
              <span className="tabular-nums">
                {totalPrice.toFixed(2)} {isAr ? 'ر.س' : 'SAR'}
              </span>
            </motion.button>

          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
