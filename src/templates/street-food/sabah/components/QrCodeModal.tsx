'use client';

import React, { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { useSabah } from '../context';
import type { Language } from '../types';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({ isOpen, onClose, lang }) => {
  const [copied, setCopied] = useState(false);
  const { info: RESTAURANT_INFO, qrDataUri } = useSabah();
  if (!isOpen) return null;

  const isAr = lang === 'ar';

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Generated on the server by the platform's QR service: it encodes the
  // permanent menu link, the same one printed on the restaurant's tables.
  const qrCodeUrl = qrDataUri;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-xs sm:max-w-sm bg-[#101712] border-2 border-emerald-500/40 rounded-3xl shadow-2xl p-6 text-center space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 left-4 rtl:left-4 ltr:right-4 p-1.5 rounded-full bg-stone-900 border border-emerald-950 text-stone-300 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Pure QR Code with clean restaurant badge - NO extraneous words above */}
        <div className="pt-2">
          <div className="p-4 bg-white rounded-2xl mx-auto inline-block shadow-2xl border border-stone-200">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="QR Code" className="w-52 h-52 mx-auto" />
            ) : null}
            <span className="block text-xs font-black text-stone-900 mt-2">
              {RESTAURANT_INFO.nameAr}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <button
            onClick={handleCopyLink}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-950"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>{isAr ? 'تم نسخ الرابط!' : 'Link Copied!'}</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>{isAr ? 'نسخ رابط المنيو' : 'Copy Menu Link'}</span>
              </>
            )}
          </button>

          <a
            href={RESTAURANT_INFO.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2 px-3 text-xs text-amber-400 hover:text-amber-300 font-bold block text-center"
          >
            {isAr ? 'عرض موقع المطعم على خرائط Google ←' : 'View on Google Maps ←'}
          </a>
        </div>

      </div>
    </div>
  );
};
