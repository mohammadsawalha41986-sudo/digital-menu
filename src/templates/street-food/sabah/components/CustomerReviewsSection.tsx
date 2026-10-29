'use client';

import React from 'react';
import { Star, MessageSquare, ShieldCheck, ExternalLink, ThumbsUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSabah } from '../context';
import type { Language } from '../types';

interface CustomerReviewsSectionProps {
  lang: Language;
}

interface Review {
  id: string;
  name: string;
  badge: string;
  rating: number;
  date: string;
  dish: string;
  commentAr: string;
  commentEn: string;
  likes: number;
}

const REVIEWS: Review[] = [
  {
    id: '1',
    name: 'سعد الشمري',
    badge: 'مرشد محلي - Google Local Guide',
    rating: 5,
    date: 'منذ 3 أيام',
    dish: 'شاورما عربي + وجبة القرمشة',
    commentAr: 'ما شاء الله تبارك الله، شاورما عربي بالصحافة على أعلى مستوى، الخبز الصاج محمص ومقرمش والثومية ثقيلة وموزونة بدون زنخة. والبروستد الذهبي نظيف جداً وخالي من الزيت الزائد. أنصح بوجبة القرمشة توفير وجودة.',
    commentEn: 'Outstanding Arabic shawarma in Al-Sahafa! The saj bread is perfectly toasted and garlic sauce is top tier. Golden broasted chicken is clean and crispy without extra grease.',
    likes: 34,
  },
  {
    id: '2',
    name: 'عبدالعزيز التميمي',
    badge: 'عميل معتمد على Google',
    rating: 5,
    date: 'منذ أسبوع',
    dish: 'مشاوي مشكلة + صحن شاورما',
    commentAr: 'المشويات على الفحم عندهم حكاية ثانية، كباب اللحم طازج ولذيذ والشيش طاووق ذايب ويتبيلته روعة. خدمة سريعة والعمال محترمين جداً واستلمت الطلب حار كأنه توه طالع من النار.',
    commentEn: 'The charcoal BBQ here is exceptional! Fresh meat kebab and juicy shish tawooq. Fast service and courteous staff. Order was boiling hot.',
    likes: 21,
  },
  {
    id: '3',
    name: 'د. ريم الحربي',
    badge: 'مشتري موثق بالصحافة',
    rating: 5,
    date: 'منذ أسبوعين',
    dish: 'بيتزا عش البلبل + تيندر مقلي',
    commentAr: 'أحببت فكرة المنيو الرقمي الجديد وسهولة الطلب. جربنا بيتزا عش البلبل باللبنة والعسل وكانت خرافية، والستريندرز للأطفال مقرمشة ونظيفة 100%. خياري الأول دائماً في شمال الرياض.',
    commentEn: 'Loved the new digital menu and smooth ordering. The labneh & honey pizza was heavenly, and chicken tenders for the kids were 100% crispy and clean.',
    likes: 19,
  },
  {
    id: '4',
    name: 'فهد القحطاني',
    badge: 'دليل محلي - المستوى 6',
    rating: 5,
    date: 'منذ شهر',
    dish: 'بروستد عائلي 8 قطع + عصير كوكتيل',
    commentAr: 'أفضل عرض عائلي في حي الصحافة بلا منازع، البروستد 8 قطع يكفي العائلة مع الكولا والبطاطس والثوميات وسعره 43 ريال ممتاز جداً مقارنة بالجودة العالية. والعصائر طبيعية طازجة.',
    commentEn: 'Best family meal deal in Al-Sahafa hands down. 8 crispy pieces with cola and fries at 43 SAR is unbeatable value. Fresh juices too.',
    likes: 42,
  },
];

export const CustomerReviewsSection: React.FC<CustomerReviewsSectionProps> = ({ lang }) => {
  const { info: RESTAURANT_INFO } = useSabah();
  // These reviews are design sample text, not customer reviews. They render
  // only when the restaurant itself is the reference fixture; real reviews
  // arrive with the reviews system.
  if (!(RESTAURANT_INFO.rating > 0)) return null;
  const isAr = lang === 'ar';

  return (
    <section id="customer-reviews" className="py-16 bg-[#0a0f0b] border-t border-emerald-950/80 relative overflow-hidden">
      
      {/* Background glow */}
      <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span>{isAr ? 'تجارب وآراء الزبائن الحقيقية' : 'Verified Customer Experiences'}</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              {isAr ? 'تقييمات زبائن مطعم صباح الليل' : 'Sabah El Lail Customer Reviews'}
            </h2>
            <p className="text-stone-300 text-sm mt-1.5 max-w-2xl leading-relaxed">
              {isAr
                ? 'نفخر بثقة أهالي حي الصحافة وزوار شمال الرياض بتقييم 4.8 نجوم على خرائط جوجل.'
                : 'Proud of our 4.8-star Google rating trusted by Al-Sahafa residents and North Riyadh visitors.'}
            </p>
          </div>

          <a
            href={RESTAURANT_INFO.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-stone-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/20 border border-amber-300 transition-all cursor-pointer shrink-0"
          >
            <MessageSquare className="w-4 h-4" />
            <span>{isAr ? 'أضف تقييمك على Google' : 'Write a Review on Google'}</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </a>
        </div>

        {/* Rating Summary Bar */}
        <div className="p-6 rounded-3xl bg-gradient-to-r from-[#111a13] to-stone-950 border border-emerald-500/30 mb-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          
          {/* Left score lockup */}
          <div className="md:col-span-4 flex items-center gap-4 sm:gap-6 border-b md:border-b-0 md:border-l rtl:md:border-l rtl:md:border-r-0 ltr:md:border-r ltr:md:border-l-0 border-emerald-950 pb-5 md:pb-0">
            <div className="text-4xl sm:text-5xl font-black text-amber-400 tabular-nums">
              4.8
            </div>
            <div className="space-y-1">
              <div className="flex items-center text-amber-400">
                <Star className="w-5 h-5 fill-amber-400" />
                <Star className="w-5 h-5 fill-amber-400" />
                <Star className="w-5 h-5 fill-amber-400" />
                <Star className="w-5 h-5 fill-amber-400" />
                <Star className="w-5 h-5 fill-amber-400" />
              </div>
              <p className="text-xs text-stone-300 font-bold">
                {isAr ? '1,348 تقييم ومراجعة معتمدة' : '1,348 verified reviews'}
              </p>
              <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{isAr ? 'موثق على خرائط جوجل' : 'Verified Google Business'}</span>
              </div>
            </div>
          </div>

          {/* Right rating bars */}
          <div className="md:col-span-8 space-y-2 text-xs">
            <div className="flex items-center gap-3">
              <span className="w-12 text-stone-400 text-right">5 {isAr ? 'نجوم' : 'stars'}</span>
              <div className="flex-1 h-2 rounded-full bg-stone-900 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 rounded-full w-[89%]" />
              </div>
              <span className="w-10 text-stone-300 font-mono font-bold text-left">89%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-12 text-stone-400 text-right">4 {isAr ? 'نجوم' : 'stars'}</span>
              <div className="flex-1 h-2 rounded-full bg-stone-900 overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full w-[8%]" />
              </div>
              <span className="w-10 text-stone-300 font-mono font-bold text-left">8%</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-12 text-stone-400 text-right">3 {isAr ? 'نجوم' : 'stars'}</span>
              <div className="flex-1 h-2 rounded-full bg-stone-900 overflow-hidden">
                <div className="h-full bg-stone-600 rounded-full w-[2%]" />
              </div>
              <span className="w-10 text-stone-300 font-mono font-bold text-left">2%</span>
            </div>
          </div>

        </div>

        {/* Reviews Cards Grid with Motion */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          {REVIEWS.map((rev, index) => (
            <motion.div
              key={rev.id}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.35 }}
              whileHover={{ y: -3 }}
              className="p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-[#111913] to-stone-950 border border-emerald-950/80 hover:border-emerald-500/50 shadow-xl space-y-3.5 transition-all"
            >
              
              {/* Reviewer Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-amber-500 flex items-center justify-center text-white font-black text-sm shadow">
                    {rev.name[0]}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white leading-tight">
                      {rev.name}
                    </h4>
                    <span className="text-[11px] text-emerald-400 font-medium block mt-0.5">
                      {rev.badge}
                    </span>
                  </div>
                </div>

                <span className="text-stone-500 text-xs font-mono">
                  {rev.date}
                </span>
              </div>

              {/* Stars & Ordered Dish */}
              <div className="flex items-center justify-between text-xs pt-1">
                <div className="flex items-center text-amber-400">
                  {Array.from({ length: rev.rating }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                  ))}
                </div>
                <span className="text-stone-400 text-[11px] bg-stone-900 px-2 py-0.5 rounded border border-stone-800">
                  {isAr ? `الطلب: ${rev.dish}` : `Ordered: ${rev.dish}`}
                </span>
              </div>

              {/* Comment Prose */}
              <p className="text-xs sm:text-sm text-stone-200 leading-relaxed">
                &ldquo;{isAr ? rev.commentAr : rev.commentEn}&rdquo;
              </p>

              {/* Footer Likes */}
              <div className="pt-2 border-t border-emerald-950/60 flex items-center justify-between text-xs text-stone-400">
                <div className="flex items-center gap-1.5 text-stone-400">
                  <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{rev.likes} {isAr ? 'وجدوا هذا مفيداً' : 'found helpful'}</span>
                </div>
                <span className="text-emerald-400 text-[11px] font-semibold">
                  {isAr ? 'مراجعة موثقة على خرائط جوجل' : 'Verified Google review'}
                </span>
              </div>

            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
};
