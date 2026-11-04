'use client';

import React, { useState } from 'react';
import { currencyUnit, formatAmount } from '../money';
import { X, Trash2, Plus, Minus, MessageCircle, Phone, ShoppingBag, MapPin, Store, Utensils, LocateFixed } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CartItem, Language, OrderType } from '../types';
import { useSabah } from '../context';
import type { MenuItem } from '../data/menuData';
import { Suggestions, orderableSuggestions } from './Suggestions';
import { distanceKm, isValidPhone, mapLink, quoteDelivery, toLatinDigits, type LatLng } from '@/lib/delivery';

const INPUT_CLASS =
  'w-full bg-stone-900 border border-emerald-950 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-emerald-400 aria-[invalid=true]:border-red-400';

/** One decimal under ten kilometres ("2.4"), whole kilometres beyond, and never "8.0". */
function formatKm(km: number): string {
  return String(km < 10 ? Math.round(km * 10) / 10 : Math.round(km));
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  cart: CartItem[];
  onUpdateQuantity: (cartItemId: string, newQty: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onClearCart: () => void;
  /** Adds a suggested dish as it is, keeping the cart open. */
  onQuickAdd?: (dish: MenuItem) => void;
  /** Opens a suggested dish in its own sheet, closing the cart. */
  onOpenDish?: (dish: MenuItem) => void;
  /** The menu's public id: orders sent from the cart are recorded for the restaurant under it. */
  publicId?: string;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  lang,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onQuickAdd,
  onOpenDish,
  publicId,
}) => {
  const { info: RESTAURANT_INFO, items: MENU_ITEMS } = useSabah();

  // What the restaurant pairs with what is already in the cart; when it pairs
  // nothing, its new dishes ("try something new"). Never what is already in.
  const inCart = cart.map((line) => line.item.id);
  const paired = orderableSuggestions(
    Array.from(new Set(cart.flatMap((line) => MENU_ITEMS.find((dish) => dish.id === line.item.id)?.pairsWith ?? []))),
    MENU_ITEMS,
    inCart,
  ).slice(0, 3);
  const fresh = paired.length > 0
    ? []
    : orderableSuggestions(MENU_ITEMS.filter((dish) => dish.isNew).map((dish) => dish.id), MENU_ITEMS, inCart).slice(0, 3);
  const [orderType, setOrderType] = useState<OrderType>('takeaway');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [apartment, setApartment] = useState('');
  const [location, setLocation] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [wantsOffers, setWantsOffers] = useState(false);

  if (!isOpen) return null;

  const isAr = lang === 'ar';
  const unit = currencyUnit(RESTAURANT_INFO.currency, isAr);
  const money = (amount: number) => `${formatAmount(amount, RESTAURANT_INFO.currency)} ${unit}`;

  const subtotal = cart.reduce((acc, item) => acc + item.totalPrice, 0);

  // Delivery by distance: the fee is known once the customer shares a location
  // and the restaurant has set where it delivers from and what each distance costs.
  const delivery = RESTAURANT_INFO.delivery;
  const isDelivery = orderType === 'delivery';
  const hasZones = Boolean(delivery.origin) && delivery.zones.length > 0;
  const limitKm = hasZones ? Math.max(...delivery.zones.map((zone) => zone.maxKm)) : null;
  const quote = isDelivery && location && delivery.origin ? quoteDelivery(delivery.zones, distanceKm(delivery.origin, location)) : null;
  const deliveryFee = quote?.status === 'in_range' ? quote.fee : 0;
  const outOfRange = quote?.status === 'out_of_range';
  const total = subtotal + (isDelivery ? deliveryFee : 0);

  const errors = {
    name: isDelivery && !customerName.trim() ? (isAr ? 'أدخل الاسم' : 'Enter your name') : null,
    phone: isDelivery && !isValidPhone(customerPhone) ? (isAr ? 'أدخل رقم جوال صحيح' : 'Enter a valid phone number') : null,
    address: isDelivery && !deliveryAddress.trim() ? (isAr ? 'أدخل عنوان التوصيل' : 'Enter the delivery address') : null,
  };
  const canSend = !errors.name && !errors.phone && !errors.address && !outOfRange;
  const phoneGiven = isValidPhone(customerPhone);
  const offersBox = RESTAURANT_INFO.offersSignup && Boolean(publicId) && phoneGiven;

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationError(true);
      return;
    }
    setLocating(true);
    setLocationError(false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError(true);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const handleSendWhatsAppOrder = () => {
    if (cart.length === 0) return;
    if (!canSend) {
      setShowErrors(true);
      return;
    }

    let orderTypeLabel = 'استلام سفري من المطعم';
    if (orderType === 'dineIn') {
      orderTypeLabel = `تناول داخل المطعم (طاولة رقم: ${tableNumber || 'غير محدد'})`;
    } else if (orderType === 'delivery') {
      orderTypeLabel = 'توصيل';
    }

    const itemsText = cart.map((ci, index) => {
      const optionStr = ci.selectedOption ? ` (${ci.selectedOption.nameAr})` : '';
      const spiceStr = ci.spiceLevel === 'spicy' ? ' [حار]' : ci.spiceLevel === 'normal' ? ' [عادي]' : '';
      const noteStr = ci.notes ? ` (ملاحظة: ${ci.notes})` : '';
      // One line per choice under the dish, so the kitchen reads them apart.
      const choiceLines = (ci.choices ?? [])
        .map((group) => `\n   • ${group.nameAr}: ${group.options.map((option) => ((option.qty ?? 1) > 1 ? `${option.nameAr} ×${option.qty}` : option.nameAr)).join('، ')}`)
        .join('');

      return `${index + 1}. ${ci.item.nameAr}${optionStr}${spiceStr} x ${ci.quantity} = ${formatAmount(ci.totalPrice, RESTAURANT_INFO.currency)} ${currencyUnit(RESTAURANT_INFO.currency, true)}${noteStr}${choiceLines}`;
    }).join('\n');

    const amountAr = (amount: number) => `${formatAmount(amount, RESTAURANT_INFO.currency)} ${currencyUnit(RESTAURANT_INFO.currency, true)}`;
    const customerInfo = isDelivery
      ? [
          `\n👤 الاسم: ${customerName.trim()}`,
          `\n📞 الجوال: ${toLatinDigits(customerPhone.replace(/\s+/g, ''))}`,
          `\n🏠 العنوان: ${deliveryAddress.trim()}`,
          apartment.trim() ? `\n🚪 الشقة / الطابق: ${apartment.trim()}` : '',
          location ? `\n📍 موقع العميل: ${mapLink(location)}` : '\n📍 موقع العميل: لم يُشارَك',
          quote ? `\n📏 المسافة التقريبية: ${formatKm(quote.km)} كم` : '',
        ].join('')
      : [
          customerName.trim() ? `\n👤 الاسم: ${customerName.trim()}` : '',
          phoneGiven ? `\n📞 الجوال: ${toLatinDigits(customerPhone.replace(/\s+/g, ''))}` : '',
        ].join('');
    const noteInfo = generalNotes.trim() ? `\n📝 ملاحظات عامة: ${generalNotes}` : '';

    // Delivery orders carry an invoice: items, the delivery fee, and the total
    // the customer will pay. Without a known fee, the restaurant confirms it.
    const totals = isDelivery
      ? `🧾 مجموع الأصناف: ${amountAr(subtotal)}
🚚 رسوم التوصيل: ${quote?.status === 'in_range' ? (deliveryFee === 0 ? 'مجاناً' : amountAr(deliveryFee)) : 'يحددها المطعم عند التأكيد'}
💰 *الإجمالي النهائي:* ${amountAr(total)}${quote?.status === 'in_range' ? '' : ' + رسوم التوصيل'}`
      : `💰 *الإجمالي النهائي:* ${amountAr(subtotal)}`;

    const message = `السلام عليكم ورحمة الله وبركاته 🌙
أود تأكيد طلب جديد من منيو *${RESTAURANT_INFO.nameAr}*:

🛵 *نوع الطلب:* ${orderTypeLabel}${customerInfo}

📋 *تفاصيل الطلب:*
${itemsText}

${totals}
${noteInfo}
شكراً لكم وفي انتظار تأكيدكم!`;

    const encoded = encodeURIComponent(message);
    const waUrl = `https://wa.me/${RESTAURANT_INFO.whatsappNumber}?text=${encoded}`;
    window.open(waUrl, '_blank');
    recordOrder();
  };

  // The restaurant's copy of the order, for its order log. Sent after WhatsApp
  // opens and never awaited: recording must not hold up or block an order.
  const recordOrder = () => {
    if (!publicId) return;
    try {
      void fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          publicId,
          locale: lang,
          orderType,
          name: customerName,
          phone: phoneGiven ? customerPhone : '',
          table: tableNumber,
          offers: offersBox && wantsOffers,
          deliveryFee: isDelivery ? deliveryFee : 0,
          items: cart.map((line) => ({ code: line.item.id, qty: line.quantity, total: line.totalPrice })),
        }),
      }).catch(() => undefined);
    } catch {
      // Never in the way of the order itself.
    }
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
                    {isAr
                      ? cart.length === 1 ? 'صنف واحد' : cart.length === 2 ? 'صنفان' : `${cart.length} أصناف`
                      : `${cart.length} ${cart.length === 1 ? 'item' : 'items'}`}
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
                  aria-label={lang === 'ar' ? 'إغلاق السلة' : 'Close cart'}
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

                    {orderType === 'delivery' ? (
                      <div className="space-y-2" data-delivery-form="">
                        <DeliveryField
                          label={isAr ? 'الاسم' : 'Name'}
                          error={showErrors ? errors.name : null}
                        >
                          <input
                            type="text"
                            autoComplete="name"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            aria-invalid={showErrors && Boolean(errors.name)}
                            placeholder={isAr ? 'اسمك الكريم' : 'Your name'}
                            className={INPUT_CLASS}
                          />
                        </DeliveryField>
                        <DeliveryField
                          label={isAr ? 'رقم الجوال' : 'Phone number'}
                          error={showErrors ? errors.phone : null}
                        >
                          <input
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            dir="ltr"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            aria-invalid={showErrors && Boolean(errors.phone)}
                            placeholder="05XXXXXXXX"
                            className={`${INPUT_CLASS} text-start`}
                          />
                        </DeliveryField>
                        <DeliveryField
                          label={isAr ? 'العنوان' : 'Address'}
                          error={showErrors ? errors.address : null}
                        >
                          <input
                            type="text"
                            autoComplete="street-address"
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                            aria-invalid={showErrors && Boolean(errors.address)}
                            placeholder={isAr ? 'الحي، الشارع، رقم المبنى' : 'District, street, building number'}
                            className={INPUT_CLASS}
                          />
                        </DeliveryField>
                        <DeliveryField label={isAr ? 'الشقة / الطابق (إن وجد)' : 'Apartment / floor (if any)'} error={null}>
                          <input
                            type="text"
                            value={apartment}
                            onChange={(e) => setApartment(e.target.value)}
                            placeholder={isAr ? 'مثال: شقة 12، الطابق الثالث' : 'e.g. Apt 12, 3rd floor'}
                            className={INPUT_CLASS}
                          />
                        </DeliveryField>

                        <button
                          type="button"
                          onClick={locate}
                          disabled={locating}
                          className="w-full min-h-11 py-2 px-3 rounded-xl border border-amber-400/60 text-amber-300 hover:bg-amber-400/10 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                        >
                          <LocateFixed className="w-4 h-4" />
                          <span>
                            {locating
                              ? isAr ? 'جاري تحديد موقعك…' : 'Finding your location…'
                              : location
                                ? isAr ? 'تحديث موقعي' : 'Update my location'
                                : hasZones
                                  ? isAr ? 'حدد موقعي لحساب رسوم التوصيل' : 'Use my location for the delivery fee'
                                  : isAr ? 'أرسل موقعي للمندوب' : 'Share my location with the driver'}
                          </span>
                        </button>

                        <p className="text-[11px] leading-relaxed" aria-live="polite" data-delivery-status="">
                          {quote?.status === 'in_range' ? (
                            <span className="text-emerald-300">
                              {isAr
                                ? `المسافة تقريباً ${formatKm(quote.km)} كم · رسوم التوصيل ${deliveryFee === 0 ? 'مجاناً' : money(deliveryFee)}`
                                : `About ${formatKm(quote.km)} km · delivery ${deliveryFee === 0 ? 'free' : money(deliveryFee)}`}
                            </span>
                          ) : quote?.status === 'out_of_range' ? (
                            <span className="text-red-300" role="alert">
                              {isAr
                                ? `موقعك على بعد ${formatKm(quote.km)} كم تقريباً، والمطعم يوصّل حتى ${formatKm(quote.limitKm)} كم. اختر السفري أو تواصل مع المطعم.`
                                : `You are about ${formatKm(quote.km)} km away; the restaurant delivers up to ${formatKm(quote.limitKm)} km. Choose takeaway or contact the restaurant.`}
                            </span>
                          ) : locationError ? (
                            <span className="text-amber-200">
                              {isAr
                                ? 'تعذّر تحديد موقعك. يمكنك إرسال الطلب وسيحدد المطعم رسوم التوصيل.'
                                : 'We could not get your location. You can still send the order; the restaurant will confirm the delivery fee.'}
                            </span>
                          ) : location ? (
                            <span className="text-emerald-300">{isAr ? 'تم تحديد موقعك وسيُرسل مع الطلب.' : 'Your location will be sent with the order.'}</span>
                          ) : limitKm !== null ? (
                            <span className="text-stone-400">{isAr ? `يوصّل المطعم حتى ${formatKm(limitKm)} كم.` : `The restaurant delivers up to ${formatKm(limitKm)} km.`}</span>
                          ) : null}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder={isAr ? 'اسمك الكريم (اختياري)' : 'Your name (Optional)'}
                          aria-label={isAr ? 'الاسم (اختياري)' : 'Name (optional)'}
                          className="w-full bg-stone-900 border border-emerald-950 rounded-xl px-3 py-1.5 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-emerald-400"
                        />
                        <input
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          dir="ltr"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder={isAr ? 'رقم جوالك (اختياري) 05xxxxxxxx' : 'Your phone (Optional)'}
                          aria-label={isAr ? 'رقم الجوال (اختياري)' : 'Phone (optional)'}
                          className="w-full bg-stone-900 border border-emerald-950 rounded-xl px-3 py-1.5 text-xs text-white placeholder-stone-400 focus:outline-none focus:border-emerald-400 rtl:text-right"
                        />
                      </div>
                    )}
                    {offersBox ? (
                      <label className="flex items-start gap-2 text-[11px] leading-5 text-stone-300 cursor-pointer" data-offers-optin="">
                        <input
                          type="checkbox"
                          checked={wantsOffers}
                          onChange={(e) => setWantsOffers(e.target.checked)}
                          className="mt-1 h-4 w-4 accent-emerald-500"
                        />
                        <span>
                          {isAr
                            ? `أرغب باستلام عروض ${RESTAURANT_INFO.nameAr} على هذا الرقم (واتساب أو رسالة). يمكنني الإلغاء في أي وقت.`
                            : `Send me ${RESTAURANT_INFO.nameEn}'s offers on this number (WhatsApp or SMS). I can stop any time.`}
                        </span>
                      </label>
                    ) : null}
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

                          {ci.choices?.map((group) => (
                            <span key={group.group} className="text-[11px] text-amber-300 font-semibold block" data-cart-choice={group.group}>
                              {isAr ? group.nameAr : group.nameEn}:{' '}
                              {group.options
                                .map((option) => `${isAr ? option.nameAr : option.nameEn}${(option.qty ?? 1) > 1 ? ` ×${option.qty}` : ''}`)
                                .join(isAr ? '، ' : ', ')}
                            </span>
                          ))}

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

                  {onQuickAdd ? (
                    <Suggestions
                      title={paired.length > 0 ? (isAr ? 'أكمل وجبتك مع' : 'Complete your meal') : isAr ? 'جرّب الجديد' : 'Try something new'}
                      dishes={paired.length > 0 ? paired : fresh}
                      isAr={isAr}
                      onAdd={onQuickAdd}
                      onOpen={onOpenDish}
                    />
                  ) : null}
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
                    <span className="tabular-nums font-semibold">{money(subtotal)}</span>
                  </div>
                  {isDelivery ? (
                    <div className="flex justify-between" data-delivery-fee="">
                      <span>{isAr ? 'رسوم التوصيل' : 'Delivery fee'}</span>
                      <span className="tabular-nums font-semibold">
                        {quote?.status === 'in_range'
                          ? deliveryFee === 0
                            ? isAr ? 'مجاناً' : 'Free'
                            : money(deliveryFee)
                          : isAr ? 'يحددها المطعم' : 'Confirmed by the restaurant'}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-base font-black text-white pt-1.5 border-t border-emerald-950">
                    <span>{isAr ? 'الإجمالي النهائي' : 'Total Amount'}</span>
                    <span className="text-amber-400 tabular-nums font-black text-lg" data-order-total="">
                      {money(total)}
                    </span>
                  </div>
                </div>

                {showErrors && !canSend ? (
                  <p className="text-[11px] text-red-300 text-center" role="alert">
                    {outOfRange
                      ? isAr ? 'العنوان خارج نطاق التوصيل.' : 'This address is outside the delivery area.'
                      : isAr ? 'أكمل بيانات التوصيل المطلوبة أعلاه.' : 'Complete the delivery details above.'}
                  </p>
                ) : null}

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
                {RESTAURANT_INFO.whatsappNumber && publicId ? (
                  <p className="text-[10px] leading-4 text-stone-500 text-center" data-order-privacy="">
                    {isAr
                      ? 'يحتفظ المطعم بنسخة من طلبك، وباسمك ورقمك إن أدخلتهما، لمتابعة طلبك وخدمتك.'
                      : 'The restaurant keeps a copy of your order, with your name and number if you give them, to follow it up.'}
                  </p>
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

/**
 * A labelled field with its error underneath. The error sits outside the label
 * so the field keeps its own name, and is tied to the input as its description.
 */
function DeliveryField({
  label,
  error,
  children,
}: {
  label: string;
  error: string | null;
  children: React.ReactElement<{ 'aria-describedby'?: string }>;
}) {
  const errorId = React.useId();
  return (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className="text-[11px] font-bold text-emerald-200">{label}</span>
        {error ? React.cloneElement(children, { 'aria-describedby': errorId }) : children}
      </label>
      {error ? (
        <span id={errorId} className="block text-[11px] text-red-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}
