import { describe, expect, it } from 'vitest';
import { brandTokensToStyle, contrastRatio, readableForeground } from '@/design/brand';
import { resolveFont } from '@/menu-studio/typography';
import {
  DEFAULT_TEMPLATE_KEY,
  isValidTemplateSelection,
  listTemplates,
  resolveTemplate,
} from '@/templates/registry';

const BRAND = {
  colorPrimary: '#2B2118',
  colorSecondary: '#7C6A52',
  colorAccent: '#B8874B',
  colorBackground: '#FAF6F0',
  colorSurface: '#FFFFFF',
  colorText: '#1A1613',
  colorMuted: '#6E635A',
  colorBorder: '#E6DDD1',
  fontHeading: 'system-serif',
  fontBody: 'system-sans',
  radiusScale: 'sm',
};

describe('brand tokens', () => {
  it('emits every brand colour as a CSS custom property', () => {
    const style = brandTokensToStyle(BRAND) as Record<string, string>;

    expect(style['--brand-color-primary']).toBe('#2B2118');
    expect(style['--brand-color-background']).toBe('#FAF6F0');
    // Font keys resolve to a real stack rather than to another custom property:
    // the platform ships the faces, so the value names them (§31, §33).
    expect(style['--brand-font-heading']).toContain('Amiri');
    expect(style['--brand-font-heading']).toMatch(/serif$/);
    expect(style['--brand-radius-md']).toBe('var(--sys-radius-sm-md)');
  });

  it('derives a legible foreground for the primary colour', () => {
    const style = brandTokensToStyle(BRAND) as Record<string, string>;
    const onPrimary = style['--brand-color-on-primary'] as string;

    expect(contrastRatio(onPrimary, BRAND.colorPrimary)).toBeGreaterThanOrEqual(4.5);
    expect(readableForeground('#ffffff')).toBe('#16181a');
    expect(readableForeground('#000000')).toBe('#ffffff');
  });

  it('falls back to a safe ramp for an unknown radius scale or font key', () => {
    const style = brandTokensToStyle({
      ...BRAND,
      radiusScale: 'enormous',
      fontHeading: 'not-a-font',
    }) as Record<string, string>;

    expect(style['--brand-radius-md']).toBe('var(--sys-radius-md-md)');
    expect(style['--brand-font-heading']).toBe(resolveFont('system-sans', 'system-sans').stack);
  });

  it('computes contrast symmetrically, as the QR validator will need (§13)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });
});

describe('one design, three photo layouts', () => {
  it('ships exactly one design, and it is the default', () => {
    expect(listTemplates().map((template) => template.key)).toEqual(['street-food']);
    expect(DEFAULT_TEMPLATE_KEY).toBe('street-food');
  });

  it('offers the photo layouts as its variants', () => {
    const [design] = listTemplates();
    expect(design?.variants.map((variant) => variant.key)).toEqual(['a', 'b', 'c']);
  });

  it('resolves a stored selection to the design and layout', () => {
    const resolved = resolveTemplate('street-food', 'c');
    expect(resolved.definition.key).toBe('street-food');
    expect(resolved.variant.key).toBe('c');
    expect(resolved.usedFallback).toBe(false);
  });

  it('keeps a printed QR working for a business still stored on a withdrawn family', () => {
    // `editorial` / `b` meant "two columns" there; it must not silently pick
    // the List layout here.
    const resolved = resolveTemplate('editorial', 'b');
    expect(resolved.definition.key).toBe(DEFAULT_TEMPLATE_KEY);
    expect(resolved.variant.key).toBe('a');
    expect(resolved.usedFallback).toBe(true);
  });

  it('rejects an unknown selection on the write path', () => {
    expect(isValidTemplateSelection('street-food', 'b')).toBe(true);
    expect(isValidTemplateSelection('street-food', 'zz')).toBe(false);
    expect(isValidTemplateSelection('editorial', 'a')).toBe(false);
  });
});
