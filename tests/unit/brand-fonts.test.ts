import { describe, expect, it } from 'vitest';
import { brandSchema } from '@/server/admin/validation';
import { FONT_FACES } from '@/menu-studio/typography';

const base = {
  colorPrimary: '#059669',
  colorSecondary: '#065F46',
  colorAccent: '#F59E0B',
  colorBackground: '#FFFFFF',
  colorSurface: '#FFFFFF',
  colorText: '#111111',
  colorMuted: '#666666',
  colorBorder: '#DDDDDD',
  radiusScale: 'md',
};

describe('brand fonts', () => {
  it('accepts every face the brand editor offers', () => {
    for (const face of FONT_FACES.filter((f) => f.family !== null)) {
      const parsed = brandSchema.safeParse({ ...base, fontHeading: face.key, fontBody: face.key });
      expect(parsed.success, face.key).toBe(true);
    }
  });

  it('rejects a font key that does not exist', () => {
    expect(brandSchema.safeParse({ ...base, fontHeading: 'comic-sans', fontBody: 'system-sans' }).success).toBe(false);
  });
});
