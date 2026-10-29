'use client';

import React, { useState } from 'react';
import { currencyUnit, formatAmount } from '../money';
import { X, Trash2, Plus, Minus, MessageCircle, Phone, ShoppingBag, MapPin, Store, Utensils } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CartItem, Language, OrderType } from '../types';
import { useSabah } from '../context';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  cart: CartItem[];
  onUpdateQuantity: (cartItemId: string, newQty: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onClearCart: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  lang,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}) => {
  const { info: RESTAURANT_INFO } = useSabah();
  const [orderType, setOrderType] = useState<OrderType>('takeaway');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');

  if (!isOpen) return null;

  const isAr = lang === 'ar';

  const subtotal = cart.reduce((acc, item) => acc + item.totalPrice, 0);

  const handleSendWhatsAppOrder = () => {
    if (cart.length === 0) return;

    let orderTypeLabel = 'استلام سفري من المطعم';
    if (orderType === 'dineIn') {
      orderTypeLabel = `تناول داخل المطعم (طاولة رقم: ${tableNumber || 'غير محدد'})`;
    } else if (orderType === 'delivery') {
      orderTypeLabel = `توصيل إلى: ${deliveryAddress || 'العنوان يحدد مع المندوب'}`;
    }

    const itemsText = cart.map((ci, index) => {
      const optionStr = ci.selectedOption ? ` (${ci.selectedOption.nameAr})` : '';
      const spiceStr = ci.spiceLevel === 'spicy' ? ' [حار]' : ci.spiceLevel === 'normal' ? ' [عادي]' : '';
      const noteStr = ci.notes ? ` (ملاحظة: ${ci.notes})` : '';

      return `${index + 1}. ${ci.item.nameAr}${optionStr}${spiceStr} x ${ci.quantity} = ${formatAmount(ci.totalPrice, RESTAURANT_INFO.currency)} ${currencyUnit(RESTAURANT_INFO.currency, true)}${noteStr}`;
    }).join('\n');

    const customerInfo = customerName.trim() ? `\n👤 الاسم: ${customerName}` : '';
    const noteInfo = generalNotes.trim() ? `\n📝 ملاحظات عامة: ${generalNotes}` : '';

    const message = `السلام عليكم ورحمة الله وبركاته 🌙
أود تأكيد طلب جديد من منيو *${RESTAURANT_INFO.nameAr}*:

🛵 *نوع الطلب:* ${orderTypeLabel}${customerInfo}

📋 *تفاصيل الطلب:*
${itemsText}

💰 *الإجمالي النهائي:* ${formatAmount(subtotal, RESTAURANT_INFO.currency)} ${currencyUnit(RESTAURANT_INFO.currency, true)}
${noteInfo}
شكراً لكم وفي انتظار تأكيدكم!`;

    const encoded = encodeURIComponent(message);
    const waUrl = `https://wa.me/${RESTAURANT_INFO.whatsappNumber}?text=${encoded}`;
    window.open(waUrl, '_blank');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden bg-stone-950/80 backdrop-blur-sm">
        <div className="absolute inset-0" onClick={onClose} />

        <div className="absolute inset-y-0 right-0 rtl:right-0 ltr:right-auto ltr:left-0 max-w-full flex">
          <motion.div 
            initial={{ x: isAr ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: isAr ? '100%' : '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-screen max-w-md bg-[var(--sf-ink-0f1711)] border-l rtl:border-l rtl:border-r-0 ltr:border-r ltr:border-l-0 border-emerald-950 shadow-2xl flex flex-col justify-between"
          >
            
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-emerald-950 flex items-center justify-between bg-stone-950">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-500/30 flex items-center justify-center text-amber-400">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white">
                    {isAr ? 'طلبك الحالي' : 'Your Order'}
                  </h2>
                  <span className="text-xs text-emerald-400 font-semibold">
                    {cart.length} {isAr ? 'أصناف محددة' : 'items selected'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    onClick={onClearCart}
                    className="text-xs text-stone-400 hover:text-red-400 transition-colors p-1"
                    title={isAr ? 'تفريغ السلة' : 'Clear Cart'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 text-stone-400">
                  <div className="w-16 h-16 rounded-2xl bg-stone-900 border border-emerald-950 flex items-center justify-center text-stone-500">
                    <ShoppingBag className="w-8 h-8" />
                  </div>
                  <h3 className="font-bold text-white text-base">
                    {isAr ? 'سلة الطلب فارغة' : 'Your order is empty'}
                  </h3>
                  <p className="text-xs text-stone-400 max-w-xs leading-relaxed">
                    {isAr
                      ? 'تصفح القائمة وأضف أطباقك المفضلة وسنجهزها لك على الفور!'
                      : 'Explore the menu and add your favorite dishes.'}
                  </p>
                  <button
                    onClick={onClose}
                    className="mt-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-md transition-colors cursor-pointer"
                  >
                    {isAr ? 'تصفح المنيو الآن' : 'Browse Menu Now'}
                  </button>
                </div>
              ) : (
                <>
                  {/* Order Type Toggle */}
                  <div className="p-3 bg-stone-950 rounded-2xl border border-emerald-950 space-y-2.5">
                    <span className="text-xs font-bold text-emerald-300 block">
                      {isAr ? 'اختر طريقة استلام الطلب:' : 'Select order type:'}
                    </span>
                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setOrderType('takeaway')}
                        className={`py-2 px-2 rounded-xl flex flex-col items-center gap-1 border transition-all cursor-pointer ${
                          orderType === 'takeaway'
                            ? 'bg-emerald-600 text-white font-bold border-emerald-400 shadow-sm'
                            : 'bg-stone-900 border-emerald-950 text-stone-400 hover:text-white'
                        }`}
                      >
                        <Store className="w-4 h-4" />
                        <span>{isAr ? 'سفري' : 'Takeaway'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setOrderType('dineIn')}
                        className={`py-2 px-2 rounded-xl flex flex-col items-center gap-1 border transition-all cursor-pointer ${
                          orderType === 'dineIn'
                            ? 'bg-emerald-600 text-white font-bold border-emerald-400 shadow-sm'
                            : 'bg-stone-900 border-emerald-950 text-stone-400 hover:text-white'
                        }`}
                      >
                        <Utensils className="w-4 h-4" />
                        <span>{isAr ? 'محلي' : 'Dine-In'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setOrderType('delivery')}
                        className={`py-2 px-2 rounded-xl flex flex-col items-center gap-1 border transition-all cursor-pointer ${
                          orderType === 'delivery'
                            ? 'bg-emerald-600 text-white font-bold border-emerald-400 shadow-sm'
                            : 'bg-stone-900 border-emerald-950 text-stone-400 hover:text-white'
                        }`}
                      >
                        <MapPin className="w-4 h-4" />
                        <span>{isAr ? 'توصيل' : 'Delivery'}</span>
                      </button>
                    </div>

                    {/* Contextual Input */}
                    {orderType === 'dineIn' && (
                      <input
                        type="text"
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        placeholder={isAr ? 'رقم الطاولة (مثال: 4)' : 'Table number (e.g. 4)'}
                        className="w-full bg-stone-900 border border-emerald-950 rounded-xl px-3 py-1.5 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-emerald-400"
                      />
                    )}

                    {orderType === 'delivery' && (
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        placeholder={isAr ? 'عنوان التوصيل (الحي، الشارع، رقم المبنى)' : 'Delivery address'}
                        className="w-full bg-stone-900 border border-emerald-950 rounded-xl px-3 py-1.5 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-emerald-400"
                      />
                    )}

                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder={isAr ? 'اسمك الكريم (اختياري)' : 'Your name (Optional)'}
                      className="w-full bg-stone-900 border border-emerald-950 rounded-xl px-3 py-1.5 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-emerald-400"
                    />
                  </div>

                  {/* Items */}
                  <div className="space-y-2.5">
                    {cart.map((ci) => (
                      <div
                        key={ci.cartItemId}
                        className="p-3 bg-stone-950 rounded-2xl border border-emerald-950 flex items-start justify-between gap-3"
                      >
                        <div className="flex-1 space-y-1">
                          <h4 className="text-sm font-bold text-white">
                            {isAr ? ci.item.nameAr : ci.item.nameEn}
                          </h4>

                          {ci.selectedOption && (
                            <span className="text-[11px] text-amber-300 font-semibold block">
                              {isAr ? ci.selectedOption.nameAr : ci.selectedOption.nameEn}
                            </span>
                          )}

                          {ci.spiceLevel && (
                            <span className="text-[10px] text-stone-400 block font-medium">
                              {ci.spiceLevel === 'spicy' ? (isAr ? 'حار (سبايسي)' : 'Spicy') : (isAr ? 'عادي' : 'Normal')}
                            </span>
                          )}

                          {ci.notes && (
                            <p className="text-[10px] text-stone-400 italic">
                              &quot;{ci.notes}&quot;
                            </p>
                          )}

                          <div className="text-xs font-black text-amber-400 pt-1 tabular-nums">
                            {formatAmount(ci.totalPrice, RESTAURANT_INFO.currency)} {currencyUnit(RESTAURANT_INFO.currency, isAr)}
                          </div>
                        </div>

                        {/* Stepper & Delete */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <button
                            onClick={() => onRemoveItem(ci.cartItemId)}
                            className="text-stone-500 hover:text-red-400 transition-colors p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          <div className="flex items-center bg-stone-900 border border-emerald-950 rounded-lg p-0.5">
                            <button
                              onClick={() => onUpdateQuantity(ci.cartItemId, ci.quantity - 1)}
                              className="w-6 h-6 rounded bg-stone-800 hover:bg-stone-750 text-white flex items-center justify-center text-xs"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-7 text-center font-bold text-xs text-white tabular-nums">
                              {ci.quantity}
                            </span>
                            <button
                              onClick={() => onUpdateQuantity(ci.cartItemId, ci.quantity + 1)}
                              className="w-6 h-6 rounded bg-stone-800 hover:bg-stone-750 text-white flex items-center justify-center text-xs"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Additional Notes */}
                  <input
                    type="text"
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    placeholder={isAr ? 'أي ملاحظة إضافية للمطعم؟' : 'Any additional instructions?'}
                    className="w-full bg-stone-950 border border-emerald-950 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-emerald-400"
                  />
                </>
              )}
            </div>

            {/* Footer Checkout Summary */}
            {cart.length > 0 && (
              <div className="p-4 sm:p-5 bg-stone-950 border-t border-emerald-950 space-y-3">
                
                {/* Calculation Summary */}
                <div className="space-y-1.5 text-xs text-stone-300">
                  <div className="flex justify-between">
                    <span>{isAr ? 'مجموع الأصناف' : 'Subtotal'}</span>
                    <span className="tabular-nums font-semibold">{formatAmount(subtotal, RESTAURANT_INFO.currency)} {currencyUnit(RESTAURANT_INFO.currency, isAr)}</span>
                  </div>
                  <div className="flex justify-between text-base font-black text-white pt-1.5 border-t border-emerald-950">
                    <span>{isAr ? 'الإجمالي النهائي' : 'Total Amount'}</span>
                    <span className="text-amber-400 tabular-nums font-black text-lg">
                      {formatAmount(subtotal, RESTAURANT_INFO.currency)} {currencyUnit(RESTAURANT_INFO.currency, isAr)}
                    </span>
                  </div>
                </div>

                {/* Send WhatsApp Order Button with Motion */}

                {RESTAURANT_INFO.whatsappNumber ? (
                <motion.button
                  data-event="contact_whatsapp"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={handleSendWhatsAppOrder}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-sm shadow-xl shadow-emerald-700/30 flex items-center justify-center gap-2 transition-all cursor-pointer border border-emerald-400/40"
                >
                  <MessageCircle className="w-5 h-5 fill-white" />
                  <span>{isAr ? 'إرسال الطلب عبر واتساب الآن' : 'Send Order via WhatsApp'}</span>
                </motion.button>
                ) : null}

                {/* Call Cashier Option */}

                {RESTAURANT_INFO.phone ? (
                <div className="flex items-center justify-center gap-2 text-xs text-stone-400 pt-1">
                  <span>{isAr ? 'أو للطلب المباشر بالهاتف:' : 'Or order by phone directly:'}</span>
                  <a data-event="contact_phone"
                    href={`tel:${RESTAURANT_INFO.phone}`}
                    className="text-amber-400 font-extrabold hover:underline flex items-center gap-1 tabular-nums"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span dir="ltr">{RESTAURANT_INFO.phoneFormatted}</span>
                  </a>
                </div>
                ) : null}

              </div>
            )}

          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};
