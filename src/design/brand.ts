import type { CSSProperties } from 'react';
import { resolveFont } from '@/menu-studio/typography';

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

/**
 * Font keys resolve through the studio's catalogue rather than through a second
 * mapping kept in step by hand (§164). Every key it knows is therefore
 * available here, including the ones added when the platform started shipping
 * real webfonts — an unknown key still falls back to the body sans.
 */

const RADIUS_SCALES: readonly RadiusScale[] = ['none', 'sm', 'md', 'lg'];

function fontStack(key: string): string {
  return resolveFont(key, 'system-sans').stack;
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
export function readableForeground(background: string, target = 4.5): string {
  const light = contrastRatio('#ffffff', background);
  const dark = contrastRatio('#16181a', background);

  const softened = light >= dark ? '#ffffff' : '#16181a';
  if (Math.max(light, dark) >= target) return softened;

  /*
   * The softened near-black is a deliberate choice — pure #000 on a coloured
   * chip reads as a hole — but it costs a little contrast, and for a mid-tone
   * accent that cost is the difference between passing and not: a bakery's
   * #D9534F chip measured 4.47:1 against #16181a and 5.24:1 against #000.
   * When the soft pair cannot clear the target, take the extreme rather than
   * ship an unreadable chip.
   */
  return light >= dark ? '#ffffff' : '#000000';
}

/**
 * A brand colour made readable *as text* on the page background.
 *
 * Templates set headings, prices and rules in the brand's primary or accent
 * colour. That is fine on a pale background and unreadable on a dark one — a
 * restaurant whose logo is deep green ended up with green prices on a
 * near-black page at 1.65:1. Rather than forbid the practice, the palette
 * carries a variant of each brand colour that has been lightened or darkened
 * until it clears 4.5:1, keeping its hue: the menu still looks like the brand,
 * and the prices can be read.
 *
 * Where a hue cannot reach the target without becoming white or black, the
 * closest achievable value is returned — an honest best rather than a claim.
 */
export function readableOn(colour: string, background: string, target = 4.5): string {
  if (contrastRatio(colour, background) >= target) return colour;

  const rgb = parseHex(colour);
  if (!rgb) return readableForeground(background);

  const { h, s } = rgbToHsl(rgb);
  const lighten = relativeLuminance(background) < 0.18;

  let best = colour;
  let bestRatio = contrastRatio(colour, background);

  for (let step = 1; step <= 100; step += 1) {
    const l = lighten ? Math.min(1, 0.5 + step / 200) : Math.max(0, 0.5 - step / 200);
    const candidate = hslToHex({ h, s: Math.max(s, 0.15), l });
    const ratio = contrastRatio(candidate, background);

    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }

    if (ratio >= target) return candidate;
  }

  return best;
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;

  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;

  h *= 60;
  return { h: h < 0 ? h + 360 : h, s, l };
}

function hslToHex({ h, s, l }: { h: number; s: number; l: number }): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];

  const m = l - c / 2;
  const byte = (value: number) =>
    Math.min(255, Math.max(0, Math.round((value + m) * 255)))
      .toString(16)
      .padStart(2, '0');

  return `#${byte(r1)}${byte(g1)}${byte(b1)}`;
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
    '--brand-color-on-accent': readableForeground(tokens.colorAccent),
    /*
     * The brand colours, made legible as text on this brand's own background.
     *
     * Solved to 5.5:1 rather than the 4.5:1 the guideline asks for. These are
     * resolved against the *page* background, but templates put them on cards,
     * banners and tinted chips whose backgrounds sit a little off it. Solving
     * to exactly 4.5 left no headroom for that, and produced text measuring
     * 4.16 and 4.32 on surfaces one step away from the page — passing the
     * calculation and failing the page. The extra margin costs a slightly
     * deeper colour and removes the whole class of near-miss.
     */
    '--brand-color-primary-text': readableOn(tokens.colorPrimary, tokens.colorBackground, 5.5),
    '--brand-color-accent-text': readableOn(tokens.colorAccent, tokens.colorBackground, 5.5),
    '--brand-color-secondary-text': readableOn(tokens.colorSecondary, tokens.colorBackground, 5.5),
    '--brand-font-heading': fontStack(tokens.fontHeading),
    '--brand-font-body': fontStack(tokens.fontBody),
    '--brand-radius-sm': `var(--sys-radius-${scale}-sm)`,
    '--brand-radius-md': `var(--sys-radius-${scale}-md)`,
    '--brand-radius-lg': `var(--sys-radius-${scale}-lg)`,
  } as CSSProperties;
}
