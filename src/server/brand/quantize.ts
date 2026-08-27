import { rgbToHsl, toHex, type Rgb } from './color';

/**
 * Median-cut colour quantisation.
 *
 * Chosen over k-means because it is deterministic without seeding, runs in a
 * single pass over a few thousand pixels, and splits along the channel that
 * actually varies — which is what separates a logo's two brand colours from
 * the anti-aliased blend between them.
 */

export interface Swatch {
  colour: Rgb;
  hex: string;
  /** Share of the sampled pixels this swatch represents, 0–1. */
  weight: number;
  saturation: number;
  lightness: number;
}

interface Box {
  pixels: Rgb[];
}

/**
 * Snapping to a coarse grid before boxing absorbs resampling noise: the same
 * logo exported at 512px and at 96px lands on the same swatches instead of on
 * two palettes that differ in the last few bits of every channel.
 */
const GRID = 8;

function snap({ r, g, b }: Rgb): Rgb {
  const step = (value: number) => Math.min(255, Math.round(value / GRID) * GRID);
  return { r: step(r), g: step(g), b: step(b) };
}

function distance(a: Rgb, b: Rgb): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

/**
 * Median cut splits by pixel *count*, so a logo that is 75% one flat colour
 * comes back as several boxes of that same colour. Merging them is what makes
 * `weight` mean "share of the logo" rather than "share of the boxes" — and
 * what lets a single-colour mark be recognised as single-colour.
 */
const MERGE_DISTANCE = 24;

function channelRange(pixels: Rgb[], channel: keyof Rgb): number {
  let min = 255;
  let max = 0;

  for (const pixel of pixels) {
    const value = pixel[channel];
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return max - min;
}

function widestChannel(pixels: Rgb[]): keyof Rgb {
  const ranges: [keyof Rgb, number][] = [
    ['r', channelRange(pixels, 'r')],
    ['g', channelRange(pixels, 'g')],
    ['b', channelRange(pixels, 'b')],
  ];

  return ranges.sort((a, b) => b[1] - a[1])[0]![0];
}

function split(box: Box): [Box, Box] | null {
  if (box.pixels.length < 2) return null;

  const channel = widestChannel(box.pixels);
  const sorted = [...box.pixels].sort((a, b) => a[channel] - b[channel]);
  const middle = Math.floor(sorted.length / 2);

  return [{ pixels: sorted.slice(0, middle) }, { pixels: sorted.slice(middle) }];
}

/**
 * The most frequent colour in the box, not the mean of the box.
 *
 * A mean drifts with resampling: scale the same logo differently and a handful
 * of edge pixels move the average by a bit or two, so the "same" logo yields a
 * different palette. The mode is the colour actually printed across the mark,
 * and it does not move.
 */
function representative(pixels: Rgb[]): Rgb {
  const counts = new Map<number, { colour: Rgb; count: number }>();

  for (const pixel of pixels) {
    const key = (pixel.r << 16) | (pixel.g << 8) | pixel.b;
    const entry = counts.get(key);

    if (entry) entry.count += 1;
    else counts.set(key, { colour: pixel, count: 1 });
  }

  let best: { colour: Rgb; count: number } | undefined;
  let bestKey = Number.POSITIVE_INFINITY;

  for (const [key, entry] of counts) {
    // Ties break on the lower key so the result never depends on Map order.
    if (!best || entry.count > best.count || (entry.count === best.count && key < bestKey)) {
      best = entry;
      bestKey = key;
    }
  }

  return best!.colour;
}

/**
 * Reduces pixels to at most `count` representative swatches, most common
 * first. Returns an empty array for an empty input rather than inventing a
 * colour.
 */
export function quantize(pixels: Rgb[], count = 6): Swatch[] {
  if (pixels.length === 0) return [];

  const snapped = pixels.map(snap);
  let boxes: Box[] = [{ pixels: snapped }];

  // Cut finer than asked for, then merge. Median cut divides by population, so
  // cutting straight to N boxes would report a 75/25 logo as 50/50 — the boxes
  // are equal by construction. Over-cutting and merging recovers the real
  // shares, which is the number the studio shows an operator.
  const target = Math.min(32, Math.max(8, count * 4));

  while (boxes.length < target) {
    // Split the box holding the most pixels: that is where the detail is.
    const target = boxes.reduce((largest, box) =>
      box.pixels.length > largest.pixels.length ? box : largest,
    );

    const halves = split(target);
    if (!halves) break;

    boxes = boxes.filter((box) => box !== target).concat(halves);
  }

  const total = snapped.length;

  const merged: { colour: Rgb; count: number }[] = [];

  for (const box of boxes) {
    if (box.pixels.length === 0) continue;

    const colour = representative(box.pixels);
    const existing = merged.find((entry) => distance(entry.colour, colour) <= MERGE_DISTANCE);

    if (existing) {
      // The larger member keeps its colour: merging must not invent a shade
      // that appears nowhere in the logo.
      if (box.pixels.length > existing.count) existing.colour = colour;
      existing.count += box.pixels.length;
      continue;
    }

    merged.push({ colour, count: box.pixels.length });
  }

  return merged
    .map(({ colour, count: pixelCount }) => {
      const { s, l } = rgbToHsl(colour);

      return {
        colour,
        hex: toHex(colour),
        weight: pixelCount / total,
        saturation: s,
        lightness: l,
      };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, count);
}
