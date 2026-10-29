'use client';

import React, { useState } from 'react';
import { MapPin, Navigation, ExternalLink, Copy, Check, Star, Clock, Phone, Share2, Compass, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSabah } from '../context';
import type { Language } from '../types';

interface GoogleLocationSectionProps {
  lang: Language;
}

export const GoogleLocationSection: React.FC<GoogleLocationSectionProps> = ({ lang }) => {
  const { info: RESTAURANT_INFO } = useSabah();
  const isAr = lang === 'ar';
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = () => {
    const fullText = `${RESTAURANT_INFO.nameAr} - ${RESTAURANT_INFO.addressAr} (${RESTAURANT_INFO.landmarkAr}) - جوال: ${RESTAURANT_INFO.phone}`;
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleShareLocation = () => {
    if (navigator.share) {
      navigator.share({
        title: RESTAURANT_INFO.nameAr,
        text: `موقع ${RESTAURANT_INFO.nameAr} على خرائط جوجل:`,
        url: RESTAURANT_INFO.googleMapsUrl,
      }).catch(() => {});
    } else {
      handleCopyAddress();
    }
  };

  return (
    <section id="google-location" className="py-16 bg-[var(--sf-ink-0a0f0b)] border-t border-emerald-950/80 scroll-mt-20 relative overflow-hidden">
      
      {/* Background brand ambiance */}
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10"
        >
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{isAr ? 'موقع الفرع المعتمد والخرائط' : 'Official Branch Location & Map'}</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              {isAr ? `موقع ${RESTAURANT_INFO.nameAr} على خرائط Google` : `${RESTAURANT_INFO.nameEn} on Google Maps`}
            </h2>
            <p className="text-stone-300 text-sm mt-1.5 max-w-2xl leading-relaxed">
              {isAr
                ? 'يسعدنا استقبالكم في فرعنا، أو اطلب سفري واستخدم الملاحة المباشرة عبر خرائط جوجل.'
                : 'Visit us, order takeaway, or navigate directly with Google Maps.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <motion.a
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              href={RESTAURANT_INFO.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-stone-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition-all border border-amber-300 cursor-pointer"
            >
              <Navigation className="w-4 h-4" />
              <span>{isAr ? 'فتح في خرائط Google' : 'Open in Google Maps'}</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </motion.a>

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleShareLocation}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-stone-900 hover:bg-stone-850 border border-emerald-900/60 text-stone-200 font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
              title={isAr ? 'مشاركة الموقع' : 'Share Location'}
            >
              <Share2 className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">{isAr ? 'مشاركة' : 'Share'}</span>
            </motion.button>
          </div>
        </motion.div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Left: Google Place Card */}
          <motion.div 
            initial={{ opacity: 0, x: isAr ? 20 : -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="lg:col-span-5 flex flex-col justify-between space-y-5 bg-gradient-to-b from-[var(--sf-ink-111913)] to-stone-950 rounded-3xl border border-emerald-500/30 p-6 shadow-2xl relative"
          >
            
            {/* Top Place Branding */}
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{isAr ? 'حساب تجاري موثق على Google' : 'Google Verified Business'}</span>
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-white mt-2.5">
                    {isAr ? RESTAURANT_INFO.nameAr : RESTAURANT_INFO.nameEn}
                  </h3>
                  <p className="text-xs text-emerald-300/80 mt-1 font-medium">
                    {isAr ? RESTAURANT_INFO.sloganAr : RESTAURANT_INFO.sloganEn}
                  </p>
                </div>

                {/* Google G Logo Badge */}
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center p-2.5 shadow-md shrink-0 border border-stone-200">
                  <svg viewBox="0 0 24 24" className="w-full h-full">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                </div>
              </div>

              {/* Star Rating Card — only when there is a real rating */}
              {RESTAURANT_INFO.rating > 0 ? (
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-stone-900/90 border border-emerald-950">
                <div className="flex items-center text-amber-400">
                  <Star className="w-5 h-5 fill-amber-400" />
                  <Star className="w-5 h-5 fill-amber-400" />
                  <Star className="w-5 h-5 fill-amber-400" />
                  <Star className="w-5 h-5 fill-amber-400" />
                  <Star className="w-5 h-5 fill-amber-400" />
                </div>
                <div className="text-sm">
                  <span className="font-black text-amber-400 text-lg mr-1 ml-1 tabular-nums">{RESTAURANT_INFO.rating.toFixed(1)}</span>
                  <span className="text-stone-300 text-xs font-semibold">
                    ({RESTAURANT_INFO.reviewCount.toLocaleString('en-US')} {isAr ? 'تقييم على Google' : 'Google reviews'})
                  </span>
                </div>
              </div>
              ) : null}

              {/* Details List */}
              <div className="space-y-3.5 text-xs sm:text-sm text-stone-200">
                {/* Address */}
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-white leading-snug">
                      {isAr ? RESTAURANT_INFO.addressAr : RESTAURANT_INFO.addressEn}
                    </p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {isAr ? RESTAURANT_INFO.landmarkAr : RESTAURANT_INFO.landmarkEn}
                    </p>
                  </div>
                </div>

                {/* Operating hours — shown only when the restaurant has stated
                    them; the design must never claim "open now" on its own. */}
                {RESTAURANT_INFO.openingHoursAr || RESTAURANT_INFO.openingHoursEn ? (
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-stone-300 font-semibold">{isAr ? RESTAURANT_INFO.openingHoursAr : RESTAURANT_INFO.openingHoursEn}</span>
                </div>
                ) : null}

                {/* Direct Phone */}
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="flex items-center gap-2.5">
                    <a
                      href={`tel:${RESTAURANT_INFO.phone}`}
                      className="font-extrabold text-amber-400 hover:underline tabular-nums text-sm"
                    >
                      <span dir="ltr">{RESTAURANT_INFO.phoneFormatted}</span>
                    </a>
                    <span className="text-stone-500">·</span>
                    <span className="text-stone-400 text-xs">{isAr ? 'اتصال مباشر' : 'Direct Call'}</span>
                  </div>
                </div>
              </div>

            </div>

            {/* Bottom Actions inside Place Card */}
            <div className="space-y-2.5 pt-3 border-t border-emerald-950">
              <div className="grid grid-cols-2 gap-2">
                <motion.a
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  href={RESTAURANT_INFO.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950 transition-colors"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>{isAr ? 'الاتجاهات بالسيارة' : 'Driving Directions'}</span>
                </motion.a>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCopyAddress}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-stone-900 hover:bg-stone-850 border border-stone-700 text-stone-200 font-semibold text-xs transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">{isAr ? 'تم النسخ!' : 'Copied!'}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-stone-400" />
                      <span>{isAr ? 'نسخ العنوان' : 'Copy Address'}</span>
                    </>
                  )}
                </motion.button>
              </div>

              {/* Service Badges */}
              <div className="flex flex-wrap gap-1.5 pt-1 text-[11px] text-stone-300">
                {(isAr ? RESTAURANT_INFO.serviceOptionsAr : RESTAURANT_INFO.serviceOptionsEn).map((srv, idx) => (
                  <span key={idx} className="px-2.5 py-0.5 rounded-lg bg-stone-900/90 border border-emerald-950/80 font-medium">
                    {srv}
                  </span>
                ))}
              </div>
            </div>

          </motion.div>

          {/* Right: Embedded Google Map Window */}
          <motion.div 
            initial={{ opacity: 0, x: isAr ? -20 : 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="lg:col-span-7 flex flex-col rounded-3xl overflow-hidden border border-emerald-500/30 bg-stone-950 shadow-2xl relative min-h-[420px]"
          >
            
            {/* Top Bar on Map */}
            <div className="bg-[var(--sf-ink-0e1510)]/95 backdrop-blur-md px-5 py-3.5 border-b border-emerald-950 flex items-center justify-between z-10">
              <div className="flex items-center gap-2 text-xs text-stone-300">
                <MapPin className="w-4 h-4 text-red-500" />
                <span className="font-extrabold text-white">{isAr ? RESTAURANT_INFO.addressAr : RESTAURANT_INFO.addressEn}</span>
                <span className="text-stone-600 hidden sm:inline">|</span>
                <span className="text-emerald-400 font-semibold hidden sm:inline">{isAr ? 'موقع الفرع المعتمد' : 'Verified Location'}</span>
              </div>
              <a
                href={RESTAURANT_INFO.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 text-xs font-bold flex items-center gap-1"
              >
                <span>{isAr ? 'تكبير الخريطة' : 'Enlarge Map'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Interactive Embedded Google Map */}
            <div className="relative flex-1 w-full h-full min-h-[350px]">
              <iframe
                title={RESTAURANT_INFO.nameAr}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(`${RESTAURANT_INFO.nameAr} ${RESTAURANT_INFO.addressAr}`.trim())}&z=15&output=embed`}
                className="w-full h-full border-0 absolute inset-0 filter contrast-105"
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
              />
              
              {/* Overlay Marker Card */}
              <div className="absolute bottom-4 right-4 left-4 sm:left-auto sm:max-w-xs bg-stone-950/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-4 shadow-2xl text-xs space-y-1.5 z-10">
                <div className="flex items-center justify-between">
                  <span className="font-black text-white text-sm">{RESTAURANT_INFO.nameAr}</span>
                  {RESTAURANT_INFO.rating > 0 ? (
                  <span className="text-amber-400 font-bold flex items-center gap-1 bg-stone-900 px-2 py-0.5 rounded-lg border border-amber-500/30">
                    <Star className="w-3 h-3 fill-amber-400" /> {RESTAURANT_INFO.rating.toFixed(1)}
                  </span>
                  ) : null}
                </div>
                <p className="text-stone-300 text-[11px] leading-relaxed">
                  {isAr ? RESTAURANT_INFO.addressAr : RESTAURANT_INFO.addressEn}
                </p>
                <div className="pt-2 flex items-center gap-2">
                  <a
                    href={RESTAURANT_INFO.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full text-center py-2 px-3 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-stone-950 font-black rounded-xl shadow-md transition-all text-xs"
                  >
                    {isAr ? 'الاتجاهات في خرائط Google' : 'Directions in Google Maps'}
                  </a>
                </div>
              </div>
            </div>

          </motion.div>

        </div>

      </div>
    </section>
  );
};
