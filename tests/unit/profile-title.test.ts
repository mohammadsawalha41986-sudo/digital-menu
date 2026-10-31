import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildProfileMetadata } from '@/server/profile/metadata';
import { resetEnvCache } from '@/lib/env';
import type { PublicProfile } from '@/server/profile/types';

/**
 * The browser title is the restaurant's name as entered in its details, even
 * when an older SEO title is still stored for it.
 */

// The locale normally comes from the request's cookies; here the page's own
// `lang` parameter stands in for the request.
vi.mock('@/server/profile/render', async (original) => ({
  ...(await original()),
  resolveRequestLocale: async (searchParams: { lang?: string }, fallback: string) =>
    searchParams.lang === 'en' ? 'en' : fallback,
}));

beforeAll(() => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
});

function profileNamed(nameAr: string, nameEn: string | null, staleSeo: { ar: string; en: string }): PublicProfile {
  return {
    publicId: 'DG9PP1',
    nameAr,
    nameEn,
    descriptionAr: null,
    descriptionEn: null,
    defaultLocale: 'ar',
    menus: [],
    seo: { metaTitleAr: staleSeo.ar, metaTitleEn: staleSeo.en, metaDescriptionAr: null, metaDescriptionEn: null, indexProfile: false },
  } as unknown as PublicProfile;
}

describe('the browser title', () => {
  it('takes the restaurant name, not an older stored SEO title', async () => {
    const meta = await buildProfileMetadata(profileNamed('أسد الحمرا البخاري', 'Asad Al Hamra Bukhari', { ar: 'أسد الحمرا', en: 'Asad Alhamra' }), {});
    expect(meta.title).toBe('أسد الحمرا البخاري');
  });

  it('uses the English name for an English page, and the Arabic name when there is none', async () => {
    const english = await buildProfileMetadata(profileNamed('أسد الحمرا البخاري', 'Asad Al Hamra Bukhari', { ar: 'x', en: 'y' }), { lang: 'en' });
    expect(english.title).toBe('Asad Al Hamra Bukhari');
    const noEnglish = await buildProfileMetadata(profileNamed('أسد الحمرا', null, { ar: 'x', en: 'y' }), { lang: 'en' });
    expect(noEnglish.title).toBe('أسد الحمرا');
  });
});
