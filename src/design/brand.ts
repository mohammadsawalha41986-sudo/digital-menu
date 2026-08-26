import type { CSSProperties } from 'react';

/**
 * Brand token emission — the *theme* half of template/theme separation
 * (master spec §21, §26, §27; GOALS I6).
 *
 * A business's stored `BrandTheme` row becomes a flat set of CSS custom
 * properties applied to the profile root. Components never receive colours as
 * props and never import a palette; they read `var(--brand-*)`. That is what
 * allows a template swap and a brand swap to be independent operations, and it
 * is why neither changes the public URL or the QR (GOALS I2).
 */

export type RadiusScale = 'none' | 'sm' | 'md' | 'lg';
export type FontKey = 'system-sans' | 'system-serif' | 'system-mono';

export interface BrandTokens {
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  colorBackground: string;
  colorSurface: string;
  colorText: string;
  colorMuted: string;
  colorBorder: string;
  fontHeading: string;
  fontBody: string;
  radiusScale: string;
}

const FONT_STACK_VARIABLE: Record<FontKey, string> = {
  'system-sans': 'var(--sys-font-stack-sans)',
  'system-serif': 'var(--sys-font-stack-serif)',
  'system-mono': 'var(--sys-font-stack-mono)',
};

const RADIUS_SCALES: readonly RadiusScale[] = ['none', 'sm', 'md', 'lg'];

function fontStack(key: string): string {
  return FONT_STACK_VARIABLE[key as FontKey] ?? FONT_STACK_VARIABLE['system-sans'];
}

function radiusScale(key: string): RadiusScale {
  return (RADIUS_SCALES as readonly string[]).includes(key) ? (key as RadiusScale) : 'md';
}

/**
 * Relative luminance per WCAG 2.x, used to pick legible foreground text over a
 * brand colour. The same computation backs the QR contrast check in Phase 2
 * (master spec §13).
 */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;

  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/** Chooses white or near-black text for a background, whichever reads better. */
export function readableForeground(background: string): string {
  return contrastRatio('#ffffff', background) >= contrastRatio('#16181a', background)
    ? '#ffffff'
    : '#16181a';
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;

  let value = match[1] as string;
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('');
  }

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

/**
 * Builds the inline style object applied to a profile's root element. Inline
 * (rather than a generated stylesheet) so that a per-business theme needs no
 * build step, no cache key and no class-name collisions across tenants.
 */
export function brandTokensToStyle(tokens: BrandTokens): CSSProperties {
  const scale = radiusScale(tokens.radiusScale);

  return {
    '--brand-color-primary': tokens.colorPrimary,
    '--brand-color-secondary': tokens.colorSecondary,
    '--brand-color-accent': tokens.colorAccent,
    '--brand-color-background': tokens.colorBackground,
    '--brand-color-surface': tokens.colorSurface,
    '--brand-color-text': tokens.colorText,
    '--brand-color-muted': tokens.colorMuted,
    '--brand-color-border': tokens.colorBorder,
    '--brand-color-on-primary': readableForeground(tokens.colorPrimary),
    '--brand-font-heading': fontStack(tokens.fontHeading),
    '--brand-font-body': fontStack(tokens.fontBody),
    '--brand-radius-sm': `var(--sys-radius-${scale}-sm)`,
    '--brand-radius-md': `var(--sys-radius-${scale}-md)`,
    '--brand-radius-lg': `var(--sys-radius-${scale}-lg)`,
  } as CSSProperties;
}
