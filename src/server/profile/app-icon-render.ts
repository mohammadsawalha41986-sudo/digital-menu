import sharp from 'sharp';

/**
 * Draws a menu's install icon: the logo centred on a square of the brand
 * colour, at exactly the size the browser asked for.
 *
 * The logo is scaled to fit inside the square, keeping its proportions, so a
 * wide logo is letterboxed rather than stretched. A margin around it keeps the
 * mark clear of the rounded corners and circular crops that home screens use.
 *
 * No I/O here: the bytes come in and a PNG goes out, so the drawing can be
 * tested with real pixels.
 */

/** Share of each side left empty around the logo. */
export const ICON_MARGIN = 0.12;

/** Used when a restaurant's colour is missing or not a plain hex colour. */
const FALLBACK_BACKGROUND = '#0b0f0c';

export function iconBackground(value: string | null | undefined): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : FALLBACK_BACKGROUND;
}

function rgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, alpha: 1 };
}

/**
 * A PNG of `size` × `size` pixels. `artwork` is any image sharp can read:
 * PNG, JPEG, WebP, GIF or SVG.
 *
 * Throws when the artwork cannot be decoded; the caller decides the fallback.
 */
export async function renderAppIcon(input: {
  size: number;
  background: string;
  artwork: Uint8Array;
}): Promise<Uint8Array> {
  const inner = Math.round(input.size * (1 - 2 * ICON_MARGIN));

  // `inside` keeps the aspect ratio: the logo's longer side reaches the
  // square's edge of the margin, the other side is shorter. `density` rasterises
  // an SVG crisply; raster inputs ignore it.
  const logo = await sharp(Buffer.from(input.artwork), { density: 300 })
    .rotate()
    .resize({ width: inner, height: inner, fit: 'inside' })
    .png()
    .toBuffer();

  const png = await sharp({
    create: { width: input.size, height: input.size, channels: 4, background: rgb(input.background) },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer();

  return new Uint8Array(png);
}
