import { beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import { buildRestaurantJsonLd, serializeJsonLd } from '@/server/profile/structured-data';
import type { PublicProfile } from '@/server/profile/types';

beforeAll(() => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
});

function profile(overrides: Partial<Record<string, unknown>> = {}): PublicProfile {
  return {
    publicId: 'XAW8AW',
    nameAr: 'تشيكنز بار',
    nameEn: 'Chickens Bar',
    logo: { url: '/uploads/businesses/XAW8AW/media/logo.webp' },
    contact: {
      phone: '+966500000000',
      addressAr: 'الرياض',
      addressEn: null,
      instagram: 'https://instagram.com/example',
      website: 'not a link',
    },
    ...overrides,
  } as unknown as PublicProfile;
}

describe('restaurant structured data', () => {
  it('says only what the restaurant entered, with the permanent menu link', () => {
    expect(buildRestaurantJsonLd(profile())).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: 'Chickens Bar',
      alternateName: 'تشيكنز بار',
      url: 'https://menu.example.com/m/XAW8AW',
      hasMenu: 'https://menu.example.com/m/XAW8AW',
      logo: 'https://menu.example.com/uploads/businesses/XAW8AW/media/logo.webp',
      image: 'https://menu.example.com/uploads/businesses/XAW8AW/media/logo.webp',
      telephone: '+966500000000',
      address: { '@type': 'PostalAddress', streetAddress: 'الرياض' },
      sameAs: ['https://instagram.com/example'],
    });
  });

  it('never carries ratings or reviews, and leaves out what is missing', () => {
    const data = buildRestaurantJsonLd(profile({ nameEn: null, logo: null, contact: { phone: null } }));
    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: 'تشيكنز بار',
      url: 'https://menu.example.com/m/XAW8AW',
      hasMenu: 'https://menu.example.com/m/XAW8AW',
    });
    expect(JSON.stringify(data)).not.toMatch(/rating|review/i);
  });

  it('cannot be broken out of its script tag by an entered name', () => {
    const text = serializeJsonLd(buildRestaurantJsonLd(profile({ nameEn: '</script><script>alert(1)</script>' })));
    expect(text).not.toContain('</script>');
    expect(JSON.parse(text).name).toBe('</script><script>alert(1)</script>');
  });
});
