import type { Locale } from '@/i18n/config';
import type { MenuCartStrings } from './menu-cart';

/**
 * UI strings for the WhatsApp cart. Kept inline rather than in the main
 * dictionary because the cart is scoped to one template family (Street Food)
 * and most profiles never render it; the main dictionary would otherwise
 * carry forty keys only a tenth of visitors see.
 */
export function menuCartStrings(locale: Locale): MenuCartStrings {
  if (locale === 'ar') {
    return {
      addToOrder: 'أضف إلى الطلب',
      cart: 'سلة الطلب',
      cartEmpty: 'سلة الطلب فارغة. اضغط + على أي صنف لإضافته.',
      itemsSingular: 'صنف',
      itemsPlural: 'أصناف',
      total: 'الإجمالي:',
      orderOnWhatsapp: 'إرسال الطلب عبر واتساب',
      clear: 'تفريغ السلة',
      remove: 'إغلاق',
      increase: 'زيادة',
      decrease: 'إنقاص',
      orderHeading: 'طلب جديد عبر القائمة الرقمية:',
      orderLineTemplate: '• {name} × {qty} — {total}',
      orderTotalTemplate: 'الإجمالي: {total}',
    };
  }
  return {
    addToOrder: 'Add to order',
    cart: 'Order basket',
    cartEmpty: 'Your basket is empty. Tap + on any dish to add it.',
    itemsSingular: 'item',
    itemsPlural: 'items',
    total: 'Total:',
    orderOnWhatsapp: 'Send order on WhatsApp',
    clear: 'Clear basket',
    remove: 'Close',
    increase: 'Increase',
    decrease: 'Decrease',
    orderHeading: 'New order from the digital menu:',
    orderLineTemplate: '• {name} × {qty} — {total}',
    orderTotalTemplate: 'Total: {total}',
  };
}
