import { describe, expect, it } from 'vitest';
import {
  artworkSvg,
  hueDistance,
  logoSvg,
  luminance,
  parseHex,
  renderArtwork,
  renderLogo,
  type ArtworkPalette,
} from '@/server/media/artwork';

const PALETTE: ArtworkPalette = {
  primary: '#2F5D50',
  secondary: '#7FA99B',
  accent: '#E07A3F',
  background: '#FBF7F0',
};

describe('colour helpers', () => {
  it('parses both hex forms', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('2F5D50')).toEqual({ r: 47, g: 93, b: 80 });
  });

  it('refuses something that is not a colour', () => {
    expect(() => parseHex('rebeccapurple')).toThrow(/not a colour/);
  });

  it('orders luminance the way the eye does', () => {
    expect(luminance('#ffffff')).toBeGreaterThan(luminance('#808080'));
    expect(luminance('#808080')).toBeGreaterThan(luminance('#000000'));
  });

  it('measures hue distance the short way round the wheel', () => {
    // Red and a hair off red: nearly nothing, not nearly 360.
    expect(hueDistance('#ff0000', '#ff0011')).toBeLessThan(10);
    // Red and cyan are opposed.
    expect(hueDistance('#ff0000', '#00ffff')).toBeCloseTo(180, 0);
  });
});

describe('artworkSvg', () => {
  it('is deterministic for a given seed', () => {
    const spec = { width: 800, height: 600, palette: PALETTE, motif: 'coffee' as const, seed: 'x' };
    expect(artworkSvg(spec)).toBe(artworkSvg(spec));
  });

  it('draws a different picture for a different seed', () => {
    const base = { width: 800, height: 600, palette: PALETTE, motif: 'coffee' as const };
    expect(artworkSvg({ ...base, seed: 'a' })).not.toBe(artworkSvg({ ...base, seed: 'b' }));
  });

  it('draws a different picture for a different motif', () => {
    const base = { width: 800, height: 600, palette: PALETTE, seed: 'same' };
    expect(artworkSvg({ ...base, motif: 'coffee' })).not.toBe(
      artworkSvg({ ...base, motif: 'burger' }),
    );
  });

  it('refuses an implausible size rather than emitting a broken document', () => {
    expect(() => artworkSvg({ width: 4, height: 4, palette: PALETTE, motif: 'dining', seed: 's' }))
      .toThrow(/implausible/);
  });

  it('carries the declared dimensions, so the renderer can reserve the space', () => {
    const svg = artworkSvg({
      width: 1600,
      height: 900,
      palette: PALETTE,
      motif: 'dining',
      seed: 's',
    });

    expect(svg).toContain('width="1600"');
    expect(svg).toContain('height="900"');
    expect(svg).toContain('viewBox="0 0 1600 900"');
  });

  it('mixes less accent into the ground when the accent opposes the primary', () => {
    // The failure this guards is mud: mixing complementary colours in RGB
    // passes through grey. Analogous pairs should travel further.
    const analogous = artworkSvg({
      width: 400,
      height: 400,
      seed: 'g',
      motif: 'dining',
      palette: { ...PALETTE, primary: '#B3202B', accent: '#F2B705' },
    });
    const opposed = artworkSvg({
      width: 400,
      height: 400,
      seed: 'g',
      motif: 'dining',
      palette: { ...PALETTE, primary: '#2F5D50', accent: '#E07A3F' },
    });

    expect(analogous).not.toBe(opposed);
  });
});

describe('rasterising', () => {
  it('renders artwork to a real WebP of the requested size', async () => {
    const bytes = await renderArtwork({
      width: 320,
      height: 200,
      palette: PALETTE,
      motif: 'bakery',
      seed: 'r',
    });

    // RIFF....WEBP
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(bytes.byteLength).toBeGreaterThan(200);
  });

  it('renders the same bytes twice, so re-seeding de-duplicates', async () => {
    const spec = {
      width: 240,
      height: 240,
      palette: PALETTE,
      motif: 'pastry' as const,
      seed: 'stable',
    };

    const a = await renderArtwork(spec);
    const b = await renderArtwork(spec);

    expect(a.equals(b)).toBe(true);
  });

  it('renders a logo as a PNG carrying the initials', async () => {
    expect(logoSvg('cr', PALETTE)).toContain('>CR<');

    const bytes = await renderLogo('CR', PALETTE, 128);
    expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  });

  it('takes at most two initials', () => {
    expect(logoSvg('Neighbourhood Bakery', PALETTE)).toContain('>NE<');
  });
});
