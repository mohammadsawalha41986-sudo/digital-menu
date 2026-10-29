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

import React, { useState, useMemo, useEffect } from 'react';
import {
  MENU_CATEGORIES as DEFAULT_CATEGORIES,
  MENU_ITEMS as DEFAULT_ITEMS,
  RESTAURANT_INFO as DEFAULT_INFO,
} from './data/menuData';
import type { MenuItem, MenuCategory, RestaurantInfo } from './data/menuData';
import { SabahDataProvider, type HeroSlide } from './context';
import type { CartItem, Language } from './types';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { CategoryNav } from './components/CategoryNav';
import { MenuSearchAndFilter } from './components/MenuSearchAndFilter';
import { MenuItemCard } from './components/MenuItemCard';
import { MenuItemRow } from './components/MenuItemRow';
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
}

export default function App({
  restaurantInfo,
  menuCategories,
  menuItems,
  initialLang,
  logoUrl = null,
  slides = [],
  qrDataUri = null,
}: SabahAppProps = {}) {
  const RESTAURANT_INFO: RestaurantInfo = restaurantInfo ?? DEFAULT_INFO;
  const MENU_CATEGORIES: MenuCategory[] = menuCategories ?? DEFAULT_CATEGORIES;
  const MENU_ITEMS: MenuItem[] = menuItems ?? DEFAULT_ITEMS;

  const [lang, setLang] = useState<Language>(initialLang ?? 'ar');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'popular' | 'offers' | 'spicy'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Modals & Drawers
  const [activeItemForCustomization, setActiveItemForCustomization] = useState<MenuItem | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isCaloriesOpen, setIsCaloriesOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('sabah_el_lail_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('sabah_el_lail_cart', JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart]);

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

  const toggleLanguage = () => {
    setLang((prev) => (prev === 'ar' ? 'en' : 'ar'));
  };

  // Cart Operations
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

  return (
    <SabahDataProvider
      value={{ info: RESTAURANT_INFO, categories: MENU_CATEGORIES, items: MENU_ITEMS, logoUrl, slides, qrDataUri }}
    >
    <div className="min-h-screen bg-[var(--sf-ink-070b08)] text-stone-100 flex flex-col font-sans selection:bg-amber-500 selection:text-stone-950">
      
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
        
        {/* 2. Full-Width Panoramic Hero Section with Gourmet Platter Presentation */}
        <HeroSection 
          lang={lang} 
          onOpenCalories={() => setIsCaloriesOpen(true)}
          onSelectFeaturedItem={(item) => setActiveItemForCustomization(item)}
        />

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
            viewMode={viewMode}
            onToggleViewMode={setViewMode}
            onOpenCaloriesModal={() => setIsCaloriesOpen(true)}
          />

          {/* 5. Menu Items Display with framer-motion Scroll Reveal Entrance */}
          <div id="menu-items-container" className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
            {categoriesToDisplay.map((cat: MenuCategory, catIndex: number) => {
              const itemsInThisCat = filteredItems.filter((i) => i.categoryId === cat.id);
              if (itemsInThisCat.length === 0) return null;

              return (
                <motion.section 
                  key={cat.id} 
                  id={cat.id}
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
                  {viewMode === 'grid' ? (
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
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6"
                    >
                      {itemsInThisCat.map((dish) => (
                        <MenuItemCard
                          key={dish.id}
                          item={dish}
                          lang={lang}
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

        {/* 6. Customer Reviews Section with Scroll Reveal */}
        <CustomerReviewsSection lang={lang} />

        {/* 7. Google Maps & Location Section (Positioned at bottom before footer) */}
        <GoogleLocationSection lang={lang} />

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
              {totalCartPrice.toFixed(2)} {isAr ? 'ر.س' : 'SAR'}
            </span>
          </motion.button>
        ) : (
          <motion.a
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
        )}

        <a
          href={`tel:${RESTAURANT_INFO.phone}`}
          className="w-12 h-12 rounded-2xl bg-stone-900 border border-emerald-500/40 text-amber-400 flex items-center justify-center shadow-lg shrink-0"
          title="اتصال هاتفي"
        >
          <Phone className="w-5 h-5" />
        </a>
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
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        lang={lang}
        cart={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
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
