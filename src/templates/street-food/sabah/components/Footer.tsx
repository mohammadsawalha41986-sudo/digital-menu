'use client';

import React from 'react';
import { MapPin, Phone, MessageCircle, Clock, ExternalLink } from 'lucide-react';
import { RESTAURANT_INFO } from '../data/menuData';
import type { Language } from '../types';

interface FooterProps {
  lang: Language;
  onOpenQr: () => void;
}

export const Footer: React.FC<FooterProps> = ({ lang, onOpenQr }) => {
  const isAr = lang === 'ar';

  return (
    <footer className="bg-[#060a07] border-t border-emerald-950/80 pt-12 pb-8 text-stone-400 text-xs">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Brand Info */}
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600/30 to-amber-500/20 border border-emerald-500/40 flex items-center justify-center p-1 shadow">
                <img
                  src="/assets/menu/logo_crop.png"
                  alt="صباح الليل"
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="text-base font-black text-white">
                {isAr ? RESTAURANT_INFO.nameAr : RESTAURANT_INFO.nameEn}
              </span>
            </div>
            <p className="text-stone-300 text-xs leading-relaxed">
              {isAr
                ? 'مطعم متخصص في الشاورما العربية والتركية، البروستد الذهبي، المشويات على الفحم، والبيتزا والعصائر الطازجة في حي الصحافة بالرياض.'
                : 'Specializing in Arabic & Turkish shawarma, golden broasted chicken, charcoal BBQ, pizzas, and fresh juices in Al-Sahafa Riyadh.'}
            </p>
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold pt-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{isAr ? RESTAURANT_INFO.openingHoursAr : RESTAURANT_INFO.openingHoursEn}</span>
            </div>
          </div>

          {/* Quick Navigation */}
          <div className="space-y-3">
            <h4 className="text-amber-300 font-extrabold text-xs uppercase tracking-wider">
              {isAr ? 'أقسام القائمة' : 'Menu Sections'}
            </h4>
            <ul className="space-y-2 font-medium">
              <li>
                <a href="#combos" className="hover:text-amber-400 transition-colors">
                  {isAr ? 'عروض التوفير والكومبو' : 'Value Combos'}
                </a>
              </li>
              <li>
                <a href="#shawarma" className="hover:text-amber-400 transition-colors">
                  {isAr ? 'الشاورما والصاروخ والعربي' : 'Shawarma & Sarookh'}
                </a>
              </li>
              <li>
                <a href="#broasted" className="hover:text-amber-400 transition-colors">
                  {isAr ? 'البروستد والتندر المقرمش' : 'Crispy Broasted & Tenders'}
                </a>
              </li>
              <li>
                <a href="#grills" className="hover:text-amber-400 transition-colors">
                  {isAr ? 'المشويات على الفحم' : 'Charcoal BBQ Grills'}
                </a>
              </li>
              <li>
                <a href="#pizza" className="hover:text-amber-400 transition-colors">
                  {isAr ? 'البيتزا والعصائر الطازجة' : 'Pizza & Fresh Juices'}
                </a>
              </li>
            </ul>
          </div>

          {/* Location & Google Maps */}
          <div className="space-y-3">
            <h4 className="text-amber-300 font-extrabold text-xs uppercase tracking-wider">
              {isAr ? 'خرائط Google والموقع' : 'Google Maps Location'}
            </h4>
            <div className="space-y-2 text-stone-300">
              <p className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="font-semibold text-white">{isAr ? RESTAURANT_INFO.addressAr : RESTAURANT_INFO.addressEn}</span>
              </p>
              <p className="text-stone-400 text-[11px] pr-6">
                {isAr ? RESTAURANT_INFO.landmarkAr : RESTAURANT_INFO.landmarkEn}
              </p>
              <a
                href={RESTAURANT_INFO.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-bold pt-1"
              >
                <span>{isAr ? 'عرض الموقع في خرائط Google' : 'Open in Google Maps'}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Contact & Orders */}
          <div className="space-y-3">
            <h4 className="text-amber-300 font-extrabold text-xs uppercase tracking-wider">
              {isAr ? 'الطلب والتواصل المباشر' : 'Order & Contact'}
            </h4>
            <div className="space-y-2.5">
              <a
                href={`tel:${RESTAURANT_INFO.phone}`}
                className="flex items-center gap-2 text-white hover:text-amber-400 transition-colors font-black text-sm tabular-nums"
              >
                <Phone className="w-4 h-4 text-emerald-400" />
                <span>{RESTAURANT_INFO.phoneFormatted}</span>
              </a>

              <a
                href={`https://wa.me/${RESTAURANT_INFO.whatsappNumber}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-colors shadow"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{isAr ? 'محادثة واتساب للطلبات' : 'Chat on WhatsApp'}</span>
              </a>

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={onOpenQr}
                  className="text-stone-300 hover:text-white underline cursor-pointer font-medium"
                >
                  {isAr ? 'رمز QR للطاولة' : 'Table QR Code'}
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Strip */}
        <div className="pt-6 border-t border-emerald-950/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-stone-500 text-[11px]">
          <p>
            © {new Date().getFullYear()} {isAr ? RESTAURANT_INFO.nameAr : RESTAURANT_INFO.nameEn}. {isAr ? 'جميع الحقوق محفوظة' : 'All rights reserved'}.
          </p>
          <div className="flex items-center gap-4">
            <a href="#hero" className="hover:text-stone-300 transition-colors font-medium">
              {isAr ? 'العودة للأعلى ↑' : 'Back to top ↑'}
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
};
