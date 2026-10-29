/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SabahApp — the full Sabah El Lail reference app, hoisted into Next.js as a
 * single client component. Fed its content through props so one restaurant
 * (its own fixture menu) or another (any DB-driven profile mapped to the
 * same shape) can render through it.
 */
'use client';

import React, { useState, useMemo, useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { currencyUnit, formatAmount } from './money';
import { hoursLine } from './hours';
import { cartStorageKey, getCart, getServerCart, setCart as writeCart, subscribeToCart } from './cart-store';
import {
  MENU_CATEGORIES as DEFAULT_CATEGORIES,
  MENU_ITEMS as DEFAULT_ITEMS,
  RESTAURANT_INFO as DEFAULT_INFO,
} from './data/menuData';
import type { MenuItem, MenuCategory, RestaurantInfo } from './data/menuData';
import { SabahDataProvider, type HeroSlide, type MenuOffer } from './context';
import type { CartItem, Language } from './types';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { CategoryNav } from './components/CategoryNav';
import { MenuSearchAndFilter } from './components/MenuSearchAndFilter';
import { MenuItemCard } from './components/MenuItemCard';
import { MenuItemRow } from './components/MenuItemRow';
import { OffersStrip } from './components/OffersStrip';
import { CustomerReviewsSection } from './components/CustomerReviewsSection';
import { GoogleLocationSection } from './components/GoogleLocationSection';
import { CaloriesTableModal } from './components/CaloriesTableModal';
import { ItemCustomizeModal } from './components/ItemCustomizeModal';
import { CartDrawer } from './components/CartDrawer';
import { QrCodeModal } from './components/QrCodeModal';
import { Footer } from './components/Footer';
import { ShoppingBag, MessageCircle, Phone, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface SabahAppProps {
  restaurantInfo?: RestaurantInfo;
  menuCategories?: MenuCategory[];
  menuItems?: MenuItem[];
  initialLang?: Language;
  logoUrl?: string | null;
  slides?: HeroSlide[];
  qrDataUri?: string | null;
  /** How dishes are laid out by default; the visitor can still switch. */
  imageLayout?: 'grid' | 'list' | 'large';
  /** Light when the owner chose a light page colour; dark by default. */
  tone?: 'light' | 'dark';
  /** Photo frame shape on dish cards. */
  imageShape?: 'landscape' | 'square' | 'portrait';
  /** Which menu colours the owner set by hand (the rest follow the brand). */
  customColors?: { page: boolean; card: boolean; price: boolean };
  /** The restaurant's permanent id; it scopes the visitor's cart. */
  publicId?: string;
  /** Current offers, for the strip in the middle of the menu. */
  offers?: MenuOffer[];
  /** Order of the page's sections. */
  sectionOrder?: string[];
  /** Offers inside the menu (after the second category) or in their own place. */
  offersInsideMenu?: boolean;
  heroEffect?: string;
  dishEffect?: string;
  backgroundStyle?: string;
}

export default function App({
  restaurantInfo,
  menuCategories,
  menuItems,
  initialLang,
  logoUrl = null,
  slides = [],
  qrDataUri = null,
  imageLayout = 'grid',
  publicId = 'reference',
  offers = [],
  sectionOrder = ['hero', 'menu', 'offers', 'reviews', 'location'],
  offersInsideMenu = true,
  heroEffect = 'slide',
  dishEffect = 'zoom',
  backgroundStyle = 'solid',
  tone = 'dark',
  imageShape = 'landscape',
  customColors = { page: false, card: false, price: false },
}: SabahAppProps = {}) {
  const BASE_INFO: RestaurantInfo = restaurantInfo ?? DEFAULT_INFO;

  // The admin's photo layout cards open the menu at the dishes. Scrolling this
  // window only — a #fragment would also scroll the admin page around it.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('focus') !== 'dishes') return;
    const dishes = document.getElementById('menu-items-container');
    if (dishes) window.scrollTo(0, dishes.getBoundingClientRect().top + window.scrollY - 120);
  }, []);

  // Opening hours depend on the visitor's "now", so they are worked out in
  // the browser (and refreshed each minute); the server render carries no
  // time-sensitive claim.
  const minute = useSyncExternalStore(subscribeToMinutes, currentMinute, noMinuteOnServer);
  const hours = useMemo(
    () => (minute === null || !BASE_INFO.workingHours ? null : hoursLine(BASE_INFO.workingHours, new Date(minute * 60_000))),
    [minute, BASE_INFO.workingHours],
  );

  const RESTAURANT_INFO: RestaurantInfo = hours
    ? { ...BASE_INFO, openingHoursAr: hours.ar, openingHoursEn: hours.en }
    : BASE_INFO;
  const MENU_CATEGORIES: MenuCategory[] = menuCategories ?? DEFAULT_CATEGORIES;
  const MENU_ITEMS: MenuItem[] = menuItems ?? DEFAULT_ITEMS;

  const [lang, setLang] = useState<Language>(initialLang ?? 'ar');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'popular' | 'offers' | 'spicy'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'large'>(imageLayout);
  
  // Modals & Drawers
  const [activeItemForCustomization, setActiveItemForCustomization] = useState<MenuItem | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isCaloriesOpen, setIsCaloriesOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Cart state
  // One cart per restaurant, read without disturbing hydration.
  const cartKey = cartStorageKey(publicId);
  const storedCart = useSyncExternalStore(subscribeToCart, () => getCart(cartKey), getServerCart);
  const setCart = (update: CartItem[] | ((previous: CartItem[]) => CartItem[])) =>
    writeCart(cartKey, typeof update === 'function' ? update : () => update);

  // A stored cart can outlive the menu it came from: a dish removed, marked
  // unavailable or repriced since. Those lines are dropped rather than sent
  // to the restaurant at a price it no longer charges.
  const cart = useMemo(
    () =>
      storedCart.filter((line) => {
        const current = MENU_ITEMS.find((dish) => dish.id === line.item?.id);
        return Boolean(current && !current.isUnavailable && !current.noPrice && current.price === line.item.price);
      }),
    [storedCart, MENU_ITEMS],
  );

  // In Next.js the <html> `lang` and `dir` attributes are owned by the
  // layout and this app renders inside a profile root that already carries
  // them, so there is nothing to mutate here. Kept as a no-op comment so a
  // reader can see the deliberate omission.

  // Track scroll position for Back to Top button
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Switching language re-renders the page in that language on the server
  // (`?lang=`), so the page root's lang/dir, the metadata and analytics all
  // agree with what is on screen. The permanent path — what the QR encodes —
  // never changes; only the query does.
  const router = useRouter();
  const toggleLanguage = () => {
    const next: Language = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', next);
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  };

  // Cart Operations
  // A suggested dish added from the dish sheet or the cart: one, plain, and
  // the cart stays where it is.
  const quickAdd = (dish: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((line) => line.item.id === dish.id && !line.selectedOption && !line.notes && !line.spiceLevel);
      if (existing) {
        return prev.map((line) =>
          line === existing ? { ...line, quantity: line.quantity + 1, totalPrice: line.unitPrice * (line.quantity + 1) } : line,
        );
      }
      return [
        ...prev,
        { cartItemId: `${dish.id}-${Date.now()}`, item: dish, quantity: 1, unitPrice: dish.price, totalPrice: dish.price },
      ];
    });
  };

  const handleAddToCart = (newItem: CartItem) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (ci) =>
          ci.item.id === newItem.item.id &&
          ci.selectedOption?.nameAr === newItem.selectedOption?.nameAr &&
          ci.spiceLevel === newItem.spiceLevel &&
          ci.extraCheese === newItem.extraCheese &&
          ci.extraGarlic === newItem.extraGarlic &&
          ci.extraSpicyGarlic === newItem.extraSpicyGarlic &&
          ci.extraHummus === newItem.extraHummus &&
          ci.notes === newItem.notes
      );

      if (existingIndex > -1) {
        const updated = [...prev];
        const exist = updated[existingIndex];
        if (exist) {
          const newQty = exist.quantity + newItem.quantity;
          updated[existingIndex] = {
            ...exist,
            quantity: newQty,
            totalPrice: exist.unitPrice * newQty,
          };
        }
        return updated;
      }
      return [...prev, newItem];
    });
    setIsCartOpen(true);
  };

  const handleUpdateQuantity = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(cartItemId);
      return;
    }
    setCart((prev) =>
      prev.map((ci) =>
        ci.cartItemId === cartItemId
          ? { ...ci, quantity: newQty, totalPrice: ci.unitPrice * newQty }
          : ci
      )
    );
  };

  const handleRemoveItem = (cartItemId: string) => {
    setCart((prev) => prev.filter((ci) => ci.cartItemId !== cartItemId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const totalCartPrice = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.totalPrice, 0);
  }, [cart]);

  // Filtered Items logic
  const filteredItems = useMemo(() => {
    return MENU_ITEMS.filter((item) => {
      if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchAr = item.nameAr.toLowerCase().includes(query) || (item.descriptionAr && item.descriptionAr.toLowerCase().includes(query));
        const matchEn = item.nameEn.toLowerCase().includes(query) || (item.descriptionEn && item.descriptionEn.toLowerCase().includes(query));
        if (!matchAr && !matchEn) return false;
      }

      if (activeFilter === 'popular' && !item.isPopular) return false;
      if (activeFilter === 'offers' && !item.isOffer) return false;
      if (activeFilter === 'spicy' && !item.isSpicyOption) return false;

      return true;
    });
  }, [selectedCategory, searchQuery, activeFilter, MENU_ITEMS]);

  // Group items by category for layout
  const categoriesToDisplay = useMemo(() => {
    if (selectedCategory !== 'all') {
      const cat = MENU_CATEGORIES.find((c) => c.id === selectedCategory);
      return cat ? [cat] : [];
    }
    return MENU_CATEGORIES;
  }, [selectedCategory, MENU_CATEGORIES]);

  const isAr = lang === 'ar';


  // The page's sections, in the order the restaurant chose on the Design page.
  // Reordered in the DOM, not with CSS, so reading and focus order follow the
  // order on screen.
  const sections: Record<string, React.ReactNode> = {
    hero: (
      <>
        {/* 2. Full-Width Panoramic Hero Section with Gourmet Platter Presentation */}
        <HeroSection 
          lang={lang} 
          effect={heroEffect}
          onOpenCalories={() => setIsCaloriesOpen(true)}
          onSelectFeaturedItem={(item) => setActiveItemForCustomization(item)}
        />
      </>
    ),
    menu: (
      <>
        {/* 3. Menu Category Sticky Bar */}
        <div id="menu-section" className="scroll-mt-18">
          <CategoryNav
            lang={lang}
            selectedCategory={selectedCategory}
            onSelectCategory={(id) => {
              setSelectedCategory(id);
              const el = document.getElementById('menu-items-container');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
              }
            }}
          />

          {/* 4. Search & Filters with View Mode Toggle */}
          <MenuSearchAndFilter
            lang={lang}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            resultCount={filteredItems.length}
            viewMode={viewMode === 'list' ? 'list' : 'grid'}
            onToggleViewMode={(mode) => setViewMode(mode === 'grid' && imageLayout === 'large' ? 'large' : mode)}
            onOpenCaloriesModal={() => setIsCaloriesOpen(true)}
            showSearch={MENU_ITEMS.length >= MENU_SEARCH_THRESHOLD}
          />

          {/* 5. Menu Items Display with framer-motion Scroll Reveal Entrance */}
          <div id="menu-items-container" className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
            {categoriesToDisplay.map((cat: MenuCategory, catIndex: number) => {
              const itemsInThisCat = filteredItems.filter((i) => i.categoryId === cat.id);
              if (itemsInThisCat.length === 0) return null;
              // The offers strip sits after the second category of the full
              // menu, where a visitor scrolling the dishes meets it.
              const showOffersAfter =
                offersInsideMenu &&
                catIndex === Math.min(1, categoriesToDisplay.length - 1) &&
                selectedCategory === 'all' &&
                activeFilter === 'all' &&
                searchQuery.trim() === '';

              return (
                <React.Fragment key={cat.id}>
                <motion.section 
                  id={cat.id}
                  data-category={cat.id}
                  initial={{ opacity: 0, y: 35 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.55, delay: catIndex * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-6 scroll-mt-36"
                >
                  {/* Category Header with Scroll Reveal */}
                  <div className="flex items-end justify-between gap-2 pb-3.5 border-b border-emerald-950/80">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/50" />
                        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                          {isAr ? cat.nameAr : cat.nameEn}
                        </h2>
                        <span className="text-xs text-amber-400 font-mono font-bold bg-stone-900/90 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                          {itemsInThisCat.length}
                        </span>
                      </div>
                      {(cat.descriptionAr || cat.descriptionEn) && (
                        <p className="text-xs sm:text-sm text-stone-300 mt-1.5">
                          {isAr ? cat.descriptionAr : cat.descriptionEn}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Items Display: Grid vs List Mode with Animated Stagger */}
                  {viewMode !== 'list' ? (
                    <motion.div 
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true }}
                      variants={{
                        hidden: {},
                        visible: {
                          transition: {
                            staggerChildren: 0.06
                          }
                        }
                      }}
                      className={viewMode === 'large' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8' : 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6'}
                    >
                      {itemsInThisCat.map((dish) => (
                        <MenuItemCard
                          key={dish.id}
                          item={dish}
                          lang={lang}
                          size={viewMode === 'large' ? 'large' : 'regular'}
                          onSelect={(item) => setActiveItemForCustomization(item)}
                        />
                      ))}
                    </motion.div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                      {itemsInThisCat.map((dish) => (
                        <MenuItemRow
                          key={dish.id}
                          item={dish}
                          lang={lang}
                          onSelect={(item) => setActiveItemForCustomization(item)}
                        />
                      ))}
                    </div>
                  )}
                </motion.section>
                {showOffersAfter ? <OffersStrip lang={lang} /> : null}
                </React.Fragment>
              );
            })}

            {filteredItems.length === 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-20 text-center space-y-4"
              >
                <div className="w-16 h-16 rounded-2xl bg-stone-900 text-stone-500 mx-auto flex items-center justify-center text-2xl font-bold border border-emerald-950">
                  !
                </div>
                <h3 className="text-lg font-bold text-white">
                  {isAr ? 'لم نعثر على أصناف مطابقة للبحث' : 'No menu items match your search'}
                </h3>
                <p className="text-stone-400 text-xs sm:text-sm max-w-sm mx-auto">
                  {isAr
                    ? 'جرب البحث بكلمة أخرى مثل "شاورما" أو "بروستد" أو اختر قسم "جميع الأقسام".'
                    : 'Try another keyword like "shawarma" or "broasted", or reset filters.'}
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                    setActiveFilter('all');
                  }}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 text-stone-950 font-black text-xs hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
                >
                  {isAr ? 'إعادة ضبط البحث' : 'Reset Search'}
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </>
    ),
    offers: offersInsideMenu ? null : (
      <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        <OffersStrip lang={lang} />
      </div>
    ),
    reviews: (
      <>
        {/* 6. Customer Reviews Section with Scroll Reveal */}
        <CustomerReviewsSection lang={lang} />
      </>
    ),
    location: (
      <>
        {/* 7. Google Maps & Location Section (Positioned at bottom before footer) */}
        <GoogleLocationSection lang={lang} />
      </>
    ),
  };

  return (
    <SabahDataProvider
      value={{ info: RESTAURANT_INFO, categories: MENU_CATEGORIES, items: MENU_ITEMS, logoUrl, slides, qrDataUri, offers }}
    >
    <div
      className="sf-root min-h-screen bg-[var(--sf-ink-070b08)] text-stone-100 flex flex-col font-sans selection:bg-amber-500 selection:text-stone-950"
      data-menu-tone={tone}
      data-image-shape={imageShape}
      data-dish-effect={dishEffect}
      data-background={backgroundStyle}
      data-custom-page={customColors.page ? '' : undefined}
      data-custom-card={customColors.card ? '' : undefined}
      data-custom-price={customColors.price ? '' : undefined}
    >
      {/* Entrance animations start hidden and are revealed by script. With
          scripting off, reveal everything at once so the menu is still read. */}
      <noscript>
        <style>{'[data-profile-root] [style*="opacity:0"]{opacity:1!important;transform:none!important}'}</style>
      </noscript>
      
      {/* 1. Navbar */}
      <Navbar
        lang={lang}
        onToggleLang={toggleLanguage}
        cartCount={totalCartCount}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenQr={() => setIsQrOpen(true)}
        onOpenCalories={() => setIsCaloriesOpen(true)}
      />

      <main className="flex-1">
        {sectionOrder.map((key) => (
          <React.Fragment key={key}>{sections[key] ?? null}</React.Fragment>
        ))}
      </main>

      {/* 8. Footer */}
      <Footer
        lang={lang}
        onOpenQr={() => setIsQrOpen(true)}
      />

      {/* Floating Bottom Quick Bar on Mobile */}
      <div className="fixed bottom-4 inset-x-4 z-30 md:hidden flex items-center gap-2">
        {totalCartCount > 0 ? (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsCartOpen(true)}
            className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-stone-950 font-black text-sm shadow-xl shadow-amber-500/30 border border-amber-300 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 stroke-[2.5]" />
              <span>{isAr ? 'عرض الطلب' : 'View Order'}</span>
              <span className="w-5 h-5 rounded-full bg-emerald-950 text-amber-300 text-xs flex items-center justify-center font-black border border-amber-400">
                {totalCartCount}
              </span>
            </div>
            <span className="tabular-nums">
              {formatAmount(totalCartPrice, RESTAURANT_INFO.currency)} {currencyUnit(RESTAURANT_INFO.currency, isAr)}
            </span>
          </motion.button>
        ) : RESTAURANT_INFO.whatsappNumber ? (
          <motion.a data-event="contact_whatsapp"
            whileTap={{ scale: 0.95 }}
            href={`https://wa.me/${RESTAURANT_INFO.whatsappNumber}?text=${encodeURIComponent(
              `السلام عليكم، أود الطلب من ${RESTAURANT_INFO.nameAr}`
            )}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm shadow-xl shadow-emerald-700/40 border border-emerald-400/40 flex items-center justify-center gap-2 transition-all"
          >
            <MessageCircle className="w-4 h-4 fill-white" />
            <span>{isAr ? 'اطلب سريعاً عبر واتساب' : 'Order via WhatsApp'}</span>
          </motion.a>
        ) : (
          <span className="flex-1" />
        )}

        {RESTAURANT_INFO.phone ? (
        <a data-event="contact_phone"
          href={`tel:${RESTAURANT_INFO.phone}`}
          className="w-12 h-12 rounded-2xl bg-stone-900 border border-emerald-500/40 text-amber-400 flex items-center justify-center shadow-lg shrink-0"
          title="اتصال هاتفي"
        >
          <Phone className="w-5 h-5" />
        </a>
        ) : null}
      </div>

      {/* Scroll to Top floating button on desktop */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="hidden md:flex fixed bottom-6 left-6 rtl:left-6 ltr:right-6 z-30 w-11 h-11 rounded-full bg-stone-900/90 hover:bg-stone-850 border border-emerald-500/40 text-amber-400 items-center justify-center shadow-xl transition-all cursor-pointer"
            title={isAr ? 'العودة للأعلى' : 'Scroll to top'}
          >
            <ArrowUp className="w-4 h-4 stroke-[2.5]" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* 9. Modals & Drawers */}
      <CaloriesTableModal
        isOpen={isCaloriesOpen}
        onClose={() => setIsCaloriesOpen(false)}
        lang={lang}
      />

      <ItemCustomizeModal
        item={activeItemForCustomization}
        lang={lang}
        onClose={() => setActiveItemForCustomization(null)}
        onAddToCart={handleAddToCart}
        onQuickAdd={quickAdd}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        lang={lang}
        cart={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        onQuickAdd={quickAdd}
      />

      <QrCodeModal
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        lang={lang}
      />

    </div>
    </SabahDataProvider>
  );
}

/** The same threshold the platform used before: below it, scrolling wins. */
const MENU_SEARCH_THRESHOLD = 6;

function subscribeToMinutes(onChange: () => void) {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}

function currentMinute(): number | null {
  return Math.floor(Date.now() / 60_000);
}

function noMinuteOnServer(): number | null {
  return null;
}
