import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { brandTokensToStyle, contrastRatio, readableForeground } from '@/design/brand';
import { resolveFont } from '@/menu-studio/typography';
import {
  DEFAULT_TEMPLATE_KEY,
  SUGGESTED_TEMPLATES,
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

describe('stylesheet discipline across every family', () => {
  const families = listTemplates().map((template) => template.key);

  const stylesheets = families.map((key) => ({
    key,
    css: readFileSync(path.join(process.cwd(), `src/templates/${key}/${key}.css`), 'utf8'),
  }));

  it('has a stylesheet for every registered family', () => {
    expect(stylesheets).toHaveLength(10);
  });

  it.each(stylesheets)('$key hard-codes no colour', ({ css }) => {
    const declarations = css
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
      .join('\n');

    // Brand identity may only enter through tokens (GOALS I6).
    expect(declarations).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(declarations).not.toMatch(/\b(rgb|hsl)a?\(/i);
  });

  it.each(stylesheets)('$key uses logical properties only', ({ css }) => {
    expect(css).not.toMatch(/(margin|padding)-(left|right)\s*:/);
    expect(css).not.toMatch(/(?<![-\w])(left|right)\s*:/);
    expect(css).not.toMatch(/text-align:\s*(left|right)/);
    expect(css).not.toMatch(/border-(left|right)\s*:/);
  });

  it.each(stylesheets)('$key respects the minimum tap target', ({ css, key }) => {
    // Every family must size its interactive elements (master spec §30).
    if (key === 'minimal') {
      expect(css).toContain('--sys-tap-target');
      return;
    }
    expect(css.match(/--sys-tap-target/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('gives each family a distinct motion personality (master spec §100)', () => {
    // Not a style check: families must not all animate the same way, which is
    // one of the ways template systems collapse into one template.
    const signatures = stylesheets.map(({ key, css }) => {
      const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]);
      const declaresNoMotion = /animation:\s*none\s*!important/.test(css);
      return { key, keyframes: keyframes.sort().join(','), declaresNoMotion };
    });

    // Minimal declares no motion at all — a personality in itself.
    expect(signatures.find((entry) => entry.key === 'minimal')?.declaresNoMotion).toBe(true);

    const named = signatures
      .filter((entry) => entry.keyframes !== '')
      .map((entry) => entry.keyframes);

    // No two families share a keyframe name, so none copied another's motion.
    expect(new Set(named).size).toBe(named.length);
  });
});

describe('template families are structurally distinct', () => {
  const sources = listTemplates().map((template) => {
    const file = `${template.key.charAt(0).toUpperCase()}${template.key.slice(1)}Template.tsx`;
    return {
      key: template.key,
      source: readFileSync(path.join(process.cwd(), `src/templates/${template.key}/${file}`), 'utf8'),
    };
  });

  it('gives every family its own class prefix, so no two share a stylesheet', () => {
    const prefixes = sources.map(({ key, source }) => {
      const matches = [...source.matchAll(/className="([a-z]+)__/g)].map((match) => match[1]);
      return { key, prefix: matches[0] };
    });

    for (const entry of prefixes) {
      expect(entry.prefix, entry.key).toBe(entry.key);
    }

    expect(new Set(prefixes.map((entry) => entry.prefix)).size).toBe(10);
  });

  it('states what structurally distinguishes each family', () => {
    for (const template of listTemplates()) {
      // A description that only mentions colour would mean the family is a
      // theme, not a template (§23).
      expect(template.description.length, template.key).toBeGreaterThan(60);
      expect(template.description.toLowerCase(), template.key).not.toMatch(
        /^(a )?(colour|color)/,
      );
    }
  });

  it('gives every family at least one variant and unique variant keys', () => {
    for (const template of listTemplates()) {
      expect(template.variants.length, template.key).toBeGreaterThan(0);

      const keys = template.variants.map((variant) => variant.key);
      expect(new Set(keys).size, template.key).toBe(keys.length);
    }
  });

  it('implements every declared variant in the family stylesheet', () => {
    // A variant offered in admin that changes nothing would be a lie.
    for (const template of listTemplates()) {
      const css = readFileSync(
        path.join(process.cwd(), `src/templates/${template.key}/${template.key}.css`),
        'utf8',
      );

      for (const variant of template.variants) {
        if (variant.key === 'a') continue; // the base composition
        expect(css, `${template.key}/${variant.key}`).toContain(`data-variant='${variant.key}'`);
      }
    }
  });
});

describe('business-type suggestions', () => {
  it('suggests only families that exist', () => {
    const known = new Set(listTemplates().map((template) => template.key));

    for (const [type, suggestions] of Object.entries(SUGGESTED_TEMPLATES)) {
      expect(suggestions.length, type).toBeGreaterThan(0);
      for (const key of suggestions) {
        expect(known.has(key), `${type} → ${key}`).toBe(true);
      }
    }
  });

  it('covers every business type the domain supports (master spec §16)', () => {
    const types = [
      'RESTAURANT',
      'CAFE',
      'BAKERY',
      'DESSERT',
      'SALON',
      'BEAUTY_CENTER',
      'SPA',
      'BARBER',
      'GYM',
      'HOTEL',
      'RETAIL',
      'OTHER',
    ];

    for (const type of types) {
      expect(SUGGESTED_TEMPLATES[type], type).toBeDefined();
    }
  });

  it('suggests the service-oriented family for service businesses', () => {
    // A salon must not be told to use a restaurant layout (§94).
    for (const type of ['SALON', 'SPA', 'BARBER', 'HOTEL', 'BEAUTY_CENTER']) {
      expect(SUGGESTED_TEMPLATES[type], type).toContain('hospitality');
    }
  });
});
