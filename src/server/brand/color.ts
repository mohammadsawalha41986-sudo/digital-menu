/**
 * Colour maths for the brand identity engine.
 *
 * Everything here is pure and deterministic: given the same pixels it produces
 * the same palette, every time. That matters because a brand identity that
 * shifts between two runs of the same logo is not an identity.
 *
 * Contrast is computed to WCAG 2.1 relative luminance, and the palette
 * derivation *guarantees* the ratios rather than hoping for them — a generated
 * palette that cannot be read is worse than no palette at all.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** Degrees, 0–360. */
  h: number;
  /** 0–1. */
  s: number;
  /** 0–1. */
  l: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const byte = (value: number) => clamp(Math.round(value), 0, 255);

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => byte(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function fromHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;

  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
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
  if (h < 0) h += 360;

  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
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
  return { r: byte((r1 + m) * 255), g: byte((g1 + m) * 255), b: byte((b1 + m) * 255) };
}

/** WCAG 2.1 relative luminance. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1–21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];

  return (lighter + 0.05) / (darker + 0.05);
}

/** Shortest distance between two hues, in degrees (0–180). */
export function hueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/**
 * Darkens or lightens a colour until it reaches `target` contrast against
 * `against`, keeping its hue and saturation. Returns the closest it managed:
 * some hues cannot reach 7:1 without becoming black, and pretending otherwise
 * would be worse than returning what is achievable.
 */
export function ensureContrast(colour: Rgb, against: Rgb, target: number): Rgb {
  if (contrastRatio(colour, against) >= target) return colour;

  const { h, s } = rgbToHsl(colour);
  const goDarker = luminance(against) > 0.18;

  let best = colour;
  let bestRatio = contrastRatio(colour, against);

  // Walk lightness in small steps; 100 steps is finer than 8-bit output.
  for (let step = 1; step <= 100; step += 1) {
    const l = goDarker ? Math.max(0, 0.5 - step / 200) : Math.min(1, 0.5 + step / 200);
    const candidate = hslToRgb({ h, s, l });
    const ratio = contrastRatio(candidate, against);

    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }

    if (ratio >= target) return candidate;
  }

  return best;
}

export function mix(a: Rgb, b: Rgb, weight: number): Rgb {
  const w = clamp(weight, 0, 1);
  return {
    r: byte(a.r * (1 - w) + b.r * w),
    g: byte(a.g * (1 - w) + b.g * w),
    b: byte(a.b * (1 - w) + b.b * w),
  };
}

export const WHITE: Rgb = { r: 255, g: 255, b: 255 };
export const BLACK: Rgb = { r: 0, g: 0, b: 0 };
