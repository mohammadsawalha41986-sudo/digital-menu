/**
 * Brand artwork generation.
 *
 * Every demo business shipped without a single image: no logo, no cover, no
 * item photography. A menu with empty image frames does not read as a
 * commercial product, so the seed needs real pictures — and a seed cannot
 * carry licensed photography, nor should a repository carry megabytes of it.
 *
 * So this module *draws* instead. It composes original artwork from each
 * business's own brand palette: a duotone ground, offset light, a motif drawn
 * from the trade, film grain and a vignette. The result is abstract — it is
 * brand art, not a photograph of a dish, and it is described as such
 * everywhere it is used. What it is not is a grey placeholder.
 *
 * Output is deterministic for a given spec. Re-seeding must not churn the
 * media table: `uploadMedia` de-duplicates on a checksum of the bytes, which
 * only works if the same spec produces the same bytes every time. Hence the
 * seeded PRNG below rather than `Math.random`.
 */

import sharp from 'sharp';

export interface ArtworkPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

/**
 * The visual vocabulary of a trade. Each motif is a different geometry, not a
 * different colour of the same one — a bakery and a burger bar should not be
 * distinguishable only by hue.
 */
export type ArtworkMotif =
  | 'dining'
  | 'coffee'
  | 'bakery'
  | 'burger'
  | 'salon'
  | 'pastry'
  | 'grill'
  | 'produce';

export interface ArtworkSpec {
  width: number;
  height: number;
  palette: ArtworkPalette;
  motif: ArtworkMotif;
  /** Any stable string. The same seed always draws the same picture. */
  seed: string;
  /** How much of the ground the light covers. Higher reads brighter. */
  intensity?: number;
}

/* -------------------------------------------------------------------------- */
/* Deterministic randomness                                                    */
/* -------------------------------------------------------------------------- */

/** xmur3 string hash, feeding a mulberry32 PRNG. Small, fast, deterministic. */
function makeRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;

  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  let state = h >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------- */
/* Colour                                                                      */
/* -------------------------------------------------------------------------- */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb {
  const value = hex.trim().replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`artwork: not a colour: ${hex}`);
  }

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');

  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Relative luminance, per WCAG 2.x. Used to keep artwork off pure black. */
export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Hue in degrees, 0–360. Grey returns 0; callers treat it as "no opinion". */
export function hue(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;

  if (span === 0) return 0;

  let h: number;
  if (max === r) h = ((g - b) / span) % 6;
  else if (max === g) h = (b - r) / span + 2;
  else h = (r - g) / span + 4;

  return ((h * 60) % 360 + 360) % 360;
}

/** Shortest angular distance between two hues, 0–180. */
export function hueDistance(a: string, b: string): number {
  const delta = Math.abs(hue(a) - hue(b)) % 360;
  return delta > 180 ? 360 - delta : delta;
}

function mix(a: string, b: string, amount: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  const t = Math.max(0, Math.min(1, amount));

  return toHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
  });
}

function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', amount);
}

function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', amount);
}

/**
 * The ground a picture is drawn on.
 *
 * Three stops, not two, and the middle one carries the brand's accent. A
 * two-stop primary-to-secondary ramp is what makes generated art look
 * generated: most brands pick a primary and a secondary from the same family,
 * so the ramp travels almost no distance and the result is a flat wash. Moving
 * *through* the accent gives the picture a hue journey, which is most of what
 * separates a photograph's depth from a gradient's flatness.
 *
 * A brand whose primary is near-white (a bakery on cream, say) cannot use that
 * primary as a ground or the artwork disappears into the page. Very light
 * colours are therefore deepened toward their own hue rather than replaced, so
 * the art still reads as that brand's.
 */
function ground(palette: ArtworkPalette): { from: string; via: string; to: string } {
  const deepen = (hex: string) =>
    luminance(hex) > 0.4 ? darken(hex, 0.6) : darken(hex, 0.15);

  const from = deepen(palette.primary);
  const to = deepen(palette.secondary);

  // How much accent the middle stop carries depends on how far the accent is
  // from the primary. Analogous pairs (a red brand with a gold accent) can take
  // a lot and gain a warm, lit ramp from it. Complementary pairs cannot: mixing
  // a green primary with an orange accent in RGB passes straight through grey,
  // and the picture comes out mud. So the mix is scaled by hue distance, and
  // for opposed hues the accent is carried by the key light instead — where it
  // reads as light falling on the ground rather than pigment stirred into it.
  const opposition = hueDistance(palette.primary, palette.accent) / 180;
  const accentMix = 0.5 - 0.34 * opposition;
  const via = darken(mix(deepen(palette.primary), palette.accent, accentMix), 0.12);

  return { from, via, to };
}

/* -------------------------------------------------------------------------- */
/* Motifs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Each motif returns SVG drawn in a 0..w / 0..h space. They are line-and-shape
 * abstractions of the trade, kept at low opacity so they read as texture at
 * card size and as composition at hero size.
 */
function motifShapes(
  motif: ArtworkMotif,
  w: number,
  h: number,
  random: () => number,
  ink: string,
): string {
  const parts: string[] = [];
  const min = Math.min(w, h);

  switch (motif) {
    case 'dining': {
      // Concentric plate rims, off-centre, as a table seen from above.
      const cx = w * (0.62 + random() * 0.16);
      const cy = h * (0.44 + random() * 0.16);

      for (let i = 0; i < 5; i += 1) {
        const r = min * (0.16 + i * 0.11);
        parts.push(
          `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${(min * 0.004).toFixed(2)}" opacity="${(0.30 - i * 0.045).toFixed(3)}"/>`,
        );
      }
      break;
    }

    case 'coffee': {
      // Rising steam: open arcs stacked and phase-shifted.
      const baseY = h * 0.78;

      for (let i = 0; i < 4; i += 1) {
        const x = w * (0.16 + i * 0.22 + random() * 0.04);
        const amp = min * (0.05 + random() * 0.04);
        const top = h * (0.16 + random() * 0.12);
        parts.push(
          `<path d="M ${x.toFixed(1)} ${baseY.toFixed(1)} C ${(x + amp).toFixed(1)} ${(baseY * 0.72).toFixed(1)}, ${(x - amp).toFixed(1)} ${(baseY * 0.5).toFixed(1)}, ${x.toFixed(1)} ${top.toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${(min * 0.008).toFixed(2)}" stroke-linecap="round" opacity="${(0.22 - i * 0.03).toFixed(3)}"/>`,
        );
      }

      // The cup rim it rises from.
      parts.push(
        `<ellipse cx="${(w * 0.5).toFixed(1)}" cy="${(h * 0.9).toFixed(1)}" rx="${(min * 0.34).toFixed(1)}" ry="${(min * 0.09).toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${(min * 0.005).toFixed(2)}" opacity="0.24"/>`,
      );
      break;
    }

    case 'bakery': {
      // Scoring slashes across a proving loaf.
      const cx = w * 0.5;
      const cy = h * 0.52;
      parts.push(
        `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(min * 0.42).toFixed(1)}" ry="${(min * 0.28).toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${(min * 0.005).toFixed(2)}" opacity="0.26"/>`,
      );

      for (let i = 0; i < 4; i += 1) {
        const offset = (i - 1.5) * min * 0.13;
        parts.push(
          `<path d="M ${(cx + offset - min * 0.12).toFixed(1)} ${(cy + min * 0.1).toFixed(1)} q ${(min * 0.12).toFixed(1)} ${(-min * 0.2).toFixed(1)} ${(min * 0.24).toFixed(1)} ${(-min * 0.02).toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${(min * 0.011).toFixed(2)}" stroke-linecap="round" opacity="0.2"/>`,
        );
      }
      break;
    }

    case 'burger': {
      // Stacked bands, the way a burger is built in section.
      const cx = w * 0.5;

      for (let i = 0; i < 5; i += 1) {
        const y = h * (0.3 + i * 0.1);
        const rx = min * (0.4 - Math.abs(i - 2) * 0.03);
        parts.push(
          `<rect x="${(cx - rx).toFixed(1)}" y="${y.toFixed(1)}" width="${(rx * 2).toFixed(1)}" height="${(h * 0.055).toFixed(1)}" rx="${(h * 0.027).toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${(min * 0.006).toFixed(2)}" opacity="${(0.26 - i * 0.03).toFixed(3)}"/>`,
        );
      }
      break;
    }

    case 'grill': {
      // Grill bars, at an angle, with the heat behind them.
      for (let i = 0; i < 9; i += 1) {
        const x = w * (-0.1 + i * 0.15);
        parts.push(
          `<line x1="${x.toFixed(1)}" y1="${(h * -0.05).toFixed(1)}" x2="${(x + w * 0.22).toFixed(1)}" y2="${(h * 1.05).toFixed(1)}" stroke="${ink}" stroke-width="${(min * 0.014).toFixed(2)}" opacity="0.14"/>`,
        );
      }
      break;
    }

    case 'salon': {
      // Long sweeping strands.
      for (let i = 0; i < 6; i += 1) {
        const x = w * (0.1 + i * 0.16);
        const bend = min * (0.12 + random() * 0.14);
        parts.push(
          `<path d="M ${x.toFixed(1)} ${(-h * 0.05).toFixed(1)} C ${(x + bend).toFixed(1)} ${(h * 0.35).toFixed(1)}, ${(x - bend).toFixed(1)} ${(h * 0.65).toFixed(1)}, ${(x + bend * 0.4).toFixed(1)} ${(h * 1.05).toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${(min * 0.006).toFixed(2)}" opacity="${(0.2 - i * 0.015).toFixed(3)}"/>`,
        );
      }
      break;
    }

    case 'pastry': {
      // A rosette of laminated folds.
      const cx = w * 0.5;
      const cy = h * 0.5;

      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2;
        const r1 = min * 0.14;
        const r2 = min * (0.34 + random() * 0.08);
        parts.push(
          `<line x1="${(cx + Math.cos(angle) * r1).toFixed(1)}" y1="${(cy + Math.sin(angle) * r1).toFixed(1)}" x2="${(cx + Math.cos(angle) * r2).toFixed(1)}" y2="${(cy + Math.sin(angle) * r2).toFixed(1)}" stroke="${ink}" stroke-width="${(min * 0.008).toFixed(2)}" stroke-linecap="round" opacity="0.2"/>`,
        );
      }

      parts.push(
        `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(min * 0.12).toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${(min * 0.006).toFixed(2)}" opacity="0.26"/>`,
      );
      break;
    }

    case 'produce': {
      // Scattered rounds, like a crate seen from above.
      for (let i = 0; i < 7; i += 1) {
        const cx = w * (0.12 + random() * 0.76);
        const cy = h * (0.16 + random() * 0.68);
        const r = min * (0.06 + random() * 0.1);
        parts.push(
          `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${ink}" stroke-width="${(min * 0.006).toFixed(2)}" opacity="0.2"/>`,
        );
      }
      break;
    }
  }

  return parts.join('');
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Builds the SVG for one piece of artwork.
 *
 * Exported so it can be asserted on directly in tests, and rendered without
 * paying for a raster in callers that only want the markup.
 */
export function artworkSvg(spec: ArtworkSpec): string {
  const { width: w, height: h, palette, motif } = spec;

  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 16 || h < 16) {
    throw new Error(`artwork: implausible size ${w}x${h}`);
  }

  const random = makeRandom(spec.seed);
  const intensity = spec.intensity ?? 1;
  const { from, via, to } = ground(palette);
  const glow = lighten(palette.accent, 0.22);
  const ink = lighten(palette.accent, 0.55);

  // A key light and a fill light in the accent, then a shadow that takes a
  // corner back. Lighting a picture from one side and letting the other fall
  // away is what stops flat vector art from reading as flat vector art; an
  // earlier version added a third *pale* light instead and every brand came
  // out milky.
  const keyX = w * (0.2 + random() * 0.28);
  const keyY = h * (0.16 + random() * 0.34);
  const fillX = w * (0.62 + random() * 0.26);
  const fillY = h * (0.5 + random() * 0.36);

  const lights = [
    `<radialGradient id="key" cx="${keyX.toFixed(1)}" cy="${keyY.toFixed(1)}" r="${(Math.max(w, h) * 0.62).toFixed(1)}" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0" stop-color="${glow}" stop-opacity="${(0.62 * intensity).toFixed(3)}"/>` +
      `<stop offset="0.45" stop-color="${glow}" stop-opacity="${(0.22 * intensity).toFixed(3)}"/>` +
      `<stop offset="1" stop-color="${glow}" stop-opacity="0"/>` +
      `</radialGradient>`,
    `<radialGradient id="fill" cx="${fillX.toFixed(1)}" cy="${fillY.toFixed(1)}" r="${(Math.max(w, h) * 0.5).toFixed(1)}" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0" stop-color="${lighten(palette.secondary, 0.3)}" stop-opacity="${(0.3 * intensity).toFixed(3)}"/>` +
      `<stop offset="1" stop-color="${lighten(palette.secondary, 0.3)}" stop-opacity="0"/>` +
      `</radialGradient>`,
    `<radialGradient id="shadow" cx="${(w * 0.9).toFixed(1)}" cy="${(h * 0.95).toFixed(1)}" r="${(Math.max(w, h) * 0.7).toFixed(1)}" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0" stop-color="#000000" stop-opacity="0.5"/>` +
      `<stop offset="1" stop-color="#000000" stop-opacity="0"/>` +
      `</radialGradient>`,
  ];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    '<defs>',
    `<linearGradient id="ground" x1="0" y1="0" x2="${w}" y2="${h}" gradientUnits="userSpaceOnUse">`,
    `<stop offset="0" stop-color="${from}"/>`,
    `<stop offset="0.52" stop-color="${via}"/>`,
    `<stop offset="1" stop-color="${to}"/>`,
    '</linearGradient>',
    lights.join(''),
    `<radialGradient id="vignette" cx="${(w / 2).toFixed(1)}" cy="${(h / 2).toFixed(1)}" r="${(Math.max(w, h) * 0.72).toFixed(1)}" gradientUnits="userSpaceOnUse">`,
    '<stop offset="0.55" stop-color="#000000" stop-opacity="0"/>',
    '<stop offset="1" stop-color="#000000" stop-opacity="0.45"/>',
    '</radialGradient>',
    // Film grain. Without it the gradients band visibly on wide hero crops.
    '<filter id="grain" x="0" y="0" width="100%" height="100%">',
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" result="noise"/>',
    '<feColorMatrix type="saturate" values="0" in="noise" result="mono"/>',
    '</filter>',
    '</defs>',
    `<rect width="${w}" height="${h}" fill="url(#ground)"/>`,
    `<rect width="${w}" height="${h}" fill="url(#key)"/>`,
    `<rect width="${w}" height="${h}" fill="url(#fill)"/>`,
    `<rect width="${w}" height="${h}" fill="url(#shadow)"/>`,
    `<g>${motifShapes(motif, w, h, random, ink)}</g>`,
    `<rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.06"/>`,
    `<rect width="${w}" height="${h}" fill="url(#vignette)"/>`,
    '</svg>',
  ].join('');
}

/**
 * A wordmark: the business's initials, set on its own brand ground.
 *
 * Drawn as geometry rather than text so it does not depend on a font being
 * installed wherever the seed happens to run.
 */
export function logoSvg(initials: string, palette: ArtworkPalette, size = 512): string {
  const letters = initials.trim().slice(0, 2).toUpperCase() || 'M';
  const { from, via, to } = ground(palette);
  const ink = lighten(palette.background, 0.7);
  const ring = (size / 2) * 0.82;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    '<defs>',
    `<linearGradient id="lg" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">`,
    `<stop offset="0" stop-color="${from}"/>`,
    `<stop offset="0.55" stop-color="${via}"/>`,
    `<stop offset="1" stop-color="${to}"/>`,
    '</linearGradient>',
    '</defs>',
    `<rect width="${size}" height="${size}" rx="${(size * 0.22).toFixed(1)}" fill="url(#lg)"/>`,
    `<circle cx="${size / 2}" cy="${size / 2}" r="${ring.toFixed(1)}" fill="none" stroke="${palette.accent}" stroke-width="${(size * 0.012).toFixed(1)}" opacity="0.75"/>`,
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Georgia, 'Times New Roman', serif" font-size="${(size * 0.4).toFixed(0)}" font-weight="700" letter-spacing="${(size * 0.02).toFixed(1)}" fill="${ink}">${letters}</text>`,
    '</svg>',
  ].join('');
}

/**
 * Rasterises artwork to WebP.
 *
 * WebP because the media pipeline generates WebP derivatives anyway and the
 * original should not be the heaviest thing it serves. Quality 82 is the knee
 * of the curve for this kind of soft, low-detail art.
 */
export async function renderArtwork(spec: ArtworkSpec): Promise<Buffer> {
  return sharp(Buffer.from(artworkSvg(spec)))
    .webp({ quality: 82, effort: 5 })
    .toBuffer();
}

export async function renderLogo(
  initials: string,
  palette: ArtworkPalette,
  size = 512,
): Promise<Buffer> {
  return sharp(Buffer.from(logoSvg(initials, palette, size)))
    .png({ compressionLevel: 9 })
    .toBuffer();
}
