'use client';

import React from 'react';
import { Globe } from 'lucide-react';
import type { SocialKey } from '../data/menuData';

/**
 * The restaurant's own social profiles. Only the ones it entered render;
 * each tap is counted by the platform's analytics script (`data-event`).
 */
const LABELS: Record<SocialKey, { ar: string; en: string }> = {
  instagram: { ar: 'إنستغرام', en: 'Instagram' },
  tiktok: { ar: 'تيك توك', en: 'TikTok' },
  facebook: { ar: 'فيسبوك', en: 'Facebook' },
  youtube: { ar: 'يوتيوب', en: 'YouTube' },
  linkedin: { ar: 'لينكدإن', en: 'LinkedIn' },
  website: { ar: 'الموقع الإلكتروني', en: 'Website' },
};

function Glyph({ name }: { name: SocialKey }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (name) {
    case 'instagram':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg {...common} fill="currentColor">
          <path d="M14 3h3a4 4 0 0 0 4 4v3a7 7 0 0 1-4-1.3V15a6 6 0 1 1-6-6h1v3.2a2.8 2.8 0 1 0 2 2.7V3Z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg {...common} fill="currentColor">
          <path d="M13.5 21v-7.5H16l.5-3h-3V8.7c0-.9.3-1.5 1.6-1.5h1.5V4.5A20 20 0 0 0 14.3 4.4c-2.3 0-3.8 1.4-3.8 3.9v2.2H8v3h2.5V21h3Z" />
        </svg>
      );
    case 'youtube':
      return (
        <svg {...common} fill="currentColor">
          <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg {...common} fill="currentColor">
          <path d="M4.5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM3 9h3v12H3V9Zm6 0h2.9v1.7c.4-.8 1.5-1.9 3.3-1.9 3.5 0 4.1 2.3 4.1 5.3V21h-3v-6.1c0-1.5 0-3.3-2-3.3s-2.3 1.6-2.3 3.2V21H9V9Z" />
        </svg>
      );
    default:
      return <Globe width={18} height={18} aria-hidden="true" />;
  }
}

export const SocialLinks: React.FC<{
  socials: { key: SocialKey; url: string }[];
  isAr: boolean;
}> = ({ socials, isAr }) => {
  if (socials.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label={isAr ? 'حساباتنا' : 'Follow us'}>
      {socials.map(({ key, url }) => (
        <li key={key}>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            data-event={`social_${key}`}
            aria-label={isAr ? LABELS[key].ar : LABELS[key].en}
            className="w-10 h-10 rounded-xl bg-stone-900/90 border border-emerald-900/60 text-emerald-300 hover:text-amber-300 hover:border-amber-400/60 flex items-center justify-center transition-colors"
          >
            <Glyph name={key} />
          </a>
        </li>
      ))}
    </ul>
  );
};
