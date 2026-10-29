'use client';

import React from 'react';
import { Sparkles, MessageCircle } from 'lucide-react';
import { useSabah } from '../context';
import { currencyUnit, formatAmount } from '../money';
import type { Language } from '../types';

/**
 * The restaurant's current offers, as a swipeable strip in the middle of the
 * menu — where a visitor who scrolled past the hero meets them again. Each
 * card leads to the offer's own link, or else to WhatsApp with the offer
 * named, so the restaurant knows which offer was asked for.
 */
export const OffersStrip: React.FC<{ lang: Language }> = ({ lang }) => {
  const { offers = [], info } = useSabah();
  const isAr = lang === 'ar';

  if (offers.length === 0) return null;

  return (
    <section className="sf-offers -mx-4 sm:mx-0" aria-label={isAr ? 'العروض' : 'Offers'} data-offers-strip>
      <div className="flex items-center gap-2 px-4 sm:px-0 mb-4">
        <Sparkles className="w-5 h-5 text-amber-400" />
        <h2 className="text-xl sm:text-2xl font-black text-white">{isAr ? 'عروض اليوم' : "Today's offers"}</h2>
      </div>

      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-4 sm:px-0 pb-2 hide-scrollbar">
        {offers.map((offer) => {
          const title = isAr ? offer.titleAr : offer.titleEn;
          const description = isAr ? offer.descriptionAr : offer.descriptionEn;
          const safeLink = offer.ctaUrl && /^https?:\/\//i.test(offer.ctaUrl) ? offer.ctaUrl : null;
          const href =
            safeLink ??
            (info.whatsappNumber
              ? `https://wa.me/${info.whatsappNumber}?text=${encodeURIComponent(
                  `السلام عليكم، أود طلب العرض: ${offer.titleAr} من ${info.nameAr}`,
                )}`
              : null);
          const label = (isAr ? offer.ctaLabelAr : offer.ctaLabelEn) || (isAr ? 'اطلب العرض' : 'Get this offer');

          return (
            <article
              key={offer.key}
              data-offer={offer.key}
              className="sf-card snap-start shrink-0 w-[78%] sm:w-[22rem] rounded-2xl overflow-hidden border border-amber-500/40 bg-stone-950/95 shadow-lg flex flex-col"
            >
              <div className="relative aspect-[16/9] bg-gradient-to-br from-emerald-700 to-amber-500">
                {offer.image ? (
                  <img
                    src={offer.image}
                    srcSet={offer.imageSrcSet}
                    sizes="(min-width: 640px) 22rem, 78vw"
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : null}
                {offer.discountPercent ? (
                  <span className="absolute top-3 rtl:right-3 ltr:left-3 px-3 py-1 rounded-full bg-amber-400 text-stone-950 text-sm font-black shadow">
                    {isAr ? `خصم ${offer.discountPercent}%` : `${offer.discountPercent}% off`}
                  </span>
                ) : null}
              </div>

              <div className="p-4 flex-1 flex flex-col gap-2">
                <h3 className="text-lg font-black text-white leading-snug">{title}</h3>
                {description ? <p className="text-sm text-stone-300 line-clamp-2">{description}</p> : null}

                <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                  {offer.price !== undefined ? (
                    <span className="flex items-baseline gap-2">
                      <span className="sf-price text-xl font-black text-amber-400 tabular-nums whitespace-nowrap">
                        {formatAmount(offer.price, info.currency)}{' '}
                        <small className="text-xs text-emerald-400">{currencyUnit(info.currency, isAr)}</small>
                      </span>
                      {offer.originalPrice !== undefined && offer.originalPrice > offer.price ? (
                        <s className="text-sm text-stone-400 tabular-nums">{formatAmount(offer.originalPrice, info.currency)}</s>
                      ) : null}
                    </span>
                  ) : (
                    <span />
                  )}

                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      data-event="offer_cta"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shrink-0"
                    >
                      {safeLink ? null : <MessageCircle className="w-4 h-4" />}
                      {label}
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
