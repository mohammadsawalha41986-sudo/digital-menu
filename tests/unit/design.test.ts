import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { brandTokensToStyle, contrastRatio, readableForeground } from '@/design/brand';
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
    expect(style['--brand-font-heading']).toBe('var(--sys-font-stack-serif)');
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
    expect(style['--brand-font-heading']).toBe('var(--sys-font-stack-sans)');
  });

  it('computes contrast symmetrically, as the QR validator will need (§13)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });
});

describe('template / theme separation', () => {
  it('resolves a stored selection to a template and variant', () => {
    const resolved = resolveTemplate('editorial', 'a');
    expect(resolved.definition.key).toBe('editorial');
    expect(resolved.variant.key).toBe('a');
    expect(resolved.usedFallback).toBe(false);
  });

  it('renders something branded rather than failing on an unknown template', () => {
    const resolved = resolveTemplate('withdrawn-family', 'z');
    expect(resolved.definition.key).toBe(DEFAULT_TEMPLATE_KEY);
    expect(resolved.usedFallback).toBe(true);
  });

  it('rejects an unknown selection on the write path', () => {
    expect(isValidTemplateSelection('editorial', 'a')).toBe(true);
    expect(isValidTemplateSelection('editorial', 'zz')).toBe(false);
    expect(isValidTemplateSelection('nope', 'a')).toBe(false);
  });

  it('gives every template at least one variant', () => {
    for (const template of listTemplates()) {
      expect(template.variants.length).toBeGreaterThan(0);
    }
  });
});

describe('stylesheet discipline', () => {
  const css = readFileSync(
    path.join(process.cwd(), 'src/templates/editorial/editorial.css'),
    'utf8',
  );

  it('hard-codes no colour — brand identity arrives only through tokens', () => {
    const declarations = css
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('/*'));

    expect(declarations.join('\n')).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(declarations.join('\n')).not.toMatch(/\b(rgb|hsl)a?\(/i);
  });

  it('uses logical properties so RTL is native rather than mirrored', () => {
    expect(css).toMatch(/padding-inline/);
    expect(css).toMatch(/margin-inline/);
    // Physical directional properties would bake LTR assumptions into layout.
    expect(css).not.toMatch(/(margin|padding)-(left|right)\s*:/);
    expect(css).not.toMatch(/\b(left|right)\s*:/);
    expect(css).not.toMatch(/text-align:\s*(left|right)/);
  });
});
