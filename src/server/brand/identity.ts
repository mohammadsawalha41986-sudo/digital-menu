import sharp from 'sharp';
import {
  BLACK,
  WHITE,
  contrastRatio,
  ensureContrast,
  fromHex,
  hslToRgb,
  hueDistance,
  luminance,
  mix,
  rgbToHsl,
  toHex,
  type Rgb,
} from './color';
import { quantize, type Swatch } from './quantize';

/**
 * Logo → brand identity (Menu Studio §6, §7, §8).
 *
 * The rule this file exists to honour: a restaurant's menu wears the
 * restaurant's colours, not the platform's. So the colours are *measured* from
 * the uploaded logo, and every value carries whether it was measured or
 * defaulted. Where a logo yields nothing usable — a one-colour black wordmark,
 * an unreadable file — the engine says so and falls back to stated defaults
 * instead of inventing a brand (GOALS I9).
 *
 * Contrast is enforced, not hoped for: text against background is pushed to at
 * least 7:1 and muted text to 4.5:1, whatever the logo happened to contain.
 */

export type Tone = 'light' | 'dark';

export interface BrandPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
}

export interface BrandIdentity {
  palette: BrandPalette;
  /** Swatches actually found in the image, most dominant first. */
  extracted: string[];
  tone: Tone;
  /** Descriptive words the measurements support. Never more than three. */
  mood: string[];
  /** True when the palette came from the image rather than from defaults. */
  fromLogo: boolean;
  /** Set when the logo could not be used, in plain words, for the operator. */
  note?: string;
}

/** Platform defaults, used only when a logo yields nothing and labelled as such. */
const DEFAULT_PALETTE: BrandPalette = {
  primary: '#1F2421',
  secondary: '#49A078',
  accent: '#C9A227',
  background: '#FBF9F5',
  surface: '#FFFFFF',
  text: '#16181A',
  muted: '#6B7280',
  border: '#E5E1D8',
};

const TEXT_CONTRAST = 7;
const MUTED_CONTRAST = 4.5;

/** Pixels this transparent are logo padding, not brand colour. */
const ALPHA_FLOOR = 32;

/**
 * Decodes the logo and samples its pixels.
 *
 * The image is resized to a small square first: a 2000px logo and its 200px
 * export must produce the same identity, and quantising a hundred thousand
 * pixels to six swatches is the same answer as quantising four thousand.
 */
async function samplePixels(bytes: Uint8Array): Promise<Rgb[]> {
  const { data, info } = await sharp(Buffer.from(bytes))
    // Nearest-neighbour: interpolation would blend a two-colour logo into a
    // third colour that is in neither the mark nor the brand.
    .resize(64, 64, { fit: 'inside', withoutEnlargement: true, kernel: 'nearest' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: Rgb[] = [];

  for (let offset = 0; offset + 3 < data.length; offset += info.channels) {
    const alpha = data[offset + 3] ?? 255;
    if (alpha < ALPHA_FLOOR) continue;

    pixels.push({ r: data[offset] ?? 0, g: data[offset + 1] ?? 0, b: data[offset + 2] ?? 0 });
  }

  return pixels;
}

/** A colour worth building a brand on: not a near-white or near-black wash. */
function isChromatic(swatch: Swatch): boolean {
  return swatch.saturation >= 0.15 && swatch.lightness > 0.08 && swatch.lightness < 0.94;
}

function pickPrimary(swatches: Swatch[]): Swatch | undefined {
  // Dominance first, but a large white field is a background, not a brand.
  return swatches.find(isChromatic) ?? swatches.find((s) => s.lightness < 0.94);
}

function pickSecondary(swatches: Swatch[], primary: Swatch): Swatch | undefined {
  const primaryHue = rgbToHsl(primary.colour).h;

  return swatches.find(
    (swatch) =>
      swatch !== primary &&
      isChromatic(swatch) &&
      hueDistance(rgbToHsl(swatch.colour).h, primaryHue) > 20,
  );
}

function pickAccent(swatches: Swatch[], exclude: Swatch[]): Swatch | undefined {
  return swatches
    .filter((swatch) => !exclude.includes(swatch) && isChromatic(swatch))
    .sort((a, b) => b.saturation - a.saturation)[0];
}

/** Rotates a hue to produce a companion colour when the logo offers only one. */
function derive(colour: Rgb, degrees: number, lightnessShift = 0): Rgb {
  const { h, s, l } = rgbToHsl(colour);
  return hslToRgb({
    h: h + degrees,
    s: Math.min(1, Math.max(0.25, s)),
    l: Math.min(0.85, Math.max(0.15, l + lightnessShift)),
  });
}

function describeMood(primary: Rgb, tone: Tone, swatches: Swatch[]): string[] {
  const { h, s, l } = rgbToHsl(primary);
  const mood: string[] = [];

  // Warmth is a hue fact, not an opinion: reds through yellows read warm.
  if (h < 60 || h >= 330) mood.push('warm');
  else if (h >= 180 && h < 260) mood.push('cool');

  if (tone === 'dark' || l < 0.3) mood.push('premium');
  if (s > 0.65) mood.push('bold');
  else if (s < 0.2) mood.push('minimal');

  // Many distinct chromatic swatches reads as playful; one or two reads focused.
  if (swatches.filter(isChromatic).length >= 4 && !mood.includes('minimal')) mood.push('playful');

  return mood.slice(0, 3);
}

function buildPalette(primary: Rgb, secondary: Rgb, accent: Rgb, tone: Tone): BrandPalette {
  const background =
    tone === 'dark'
      ? mix(primary, BLACK, 0.82)
      : mix(primary, WHITE, 0.94);

  const surface = tone === 'dark' ? mix(background, WHITE, 0.06) : WHITE;

  const textSeed = tone === 'dark' ? WHITE : mix(primary, BLACK, 0.75);
  const text = ensureContrast(textSeed, background, TEXT_CONTRAST);
  const muted = ensureContrast(mix(text, background, 0.45), background, MUTED_CONTRAST);
  const border = mix(background, tone === 'dark' ? WHITE : BLACK, 0.12);

  return {
    primary: toHex(primary),
    secondary: toHex(secondary),
    accent: toHex(accent),
    background: toHex(background),
    surface: toHex(surface),
    text: toHex(text),
    muted: toHex(muted),
    border: toHex(border),
  };
}

/**
 * Analyses a logo. Never throws for a bad image: an operator uploading a file
 * the decoder dislikes gets defaults and a sentence explaining it, not a stack
 * trace and a dead form.
 */
export async function deriveIdentityFromLogo(bytes: Uint8Array): Promise<BrandIdentity> {
  let pixels: Rgb[];

  try {
    pixels = await samplePixels(bytes);
  } catch {
    return {
      palette: DEFAULT_PALETTE,
      extracted: [],
      tone: 'light',
      mood: [],
      fromLogo: false,
      note: 'The logo could not be read as an image. Platform defaults are shown; set the colours by hand.',
    };
  }

  if (pixels.length < 16) {
    return {
      palette: DEFAULT_PALETTE,
      extracted: [],
      tone: 'light',
      mood: [],
      fromLogo: false,
      note: 'The logo is almost entirely transparent, so no colours could be measured from it.',
    };
  }

  const swatches = quantize(pixels, 6);
  const primarySwatch = pickPrimary(swatches);

  if (!primarySwatch) {
    return {
      palette: DEFAULT_PALETTE,
      extracted: swatches.map((swatch) => swatch.hex),
      tone: 'light',
      mood: [],
      fromLogo: false,
      note: 'The logo is a single flat tone, which is not enough to build a palette from.',
    };
  }

  const primary = primarySwatch.colour;
  const secondarySwatch = pickSecondary(swatches, primarySwatch);
  const accentSwatch = pickAccent(swatches, [primarySwatch, ...(secondarySwatch ? [secondarySwatch] : [])]);

  // A one-colour logo is common and legitimate. Companions are derived from it
  // by hue rotation rather than picked from a stock palette, so a green logo
  // never yields somebody else's orange.
  const secondary = secondarySwatch?.colour ?? derive(primary, 24, 0.12);
  const accent = accentSwatch?.colour ?? derive(primary, 180, 0.05);

  // The logo's own weight decides the page: a mark that is mostly dark ink
  // wants a dark menu, and one on light ground wants a light one.
  const weighted = swatches.reduce((sum, swatch) => sum + luminance(swatch.colour) * swatch.weight, 0);
  const tone: Tone = weighted < 0.22 ? 'dark' : 'light';

  return {
    palette: buildPalette(primary, secondary, accent, tone),
    extracted: swatches.map((swatch) => swatch.hex),
    tone,
    mood: describeMood(primary, tone, swatches),
    fromLogo: true,
  };
}

/** Re-derives the supporting colours after an operator changes a brand colour. */
export function repaletteFrom(
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  tone: Tone,
): BrandPalette | null {
  const primary = fromHex(primaryHex);
  const secondary = fromHex(secondaryHex);
  const accent = fromHex(accentHex);

  if (!primary || !secondary || !accent) return null;

  return buildPalette(primary, secondary, accent, tone);
}

/** Exposed so the studio can show the ratio it achieved, not claim one. */
export function paletteContrast(palette: BrandPalette): { text: number; muted: number } | null {
  const background = fromHex(palette.background);
  const text = fromHex(palette.text);
  const muted = fromHex(palette.muted);

  if (!background || !text || !muted) return null;

  return {
    text: contrastRatio(text, background),
    muted: contrastRatio(muted, background),
  };
}
