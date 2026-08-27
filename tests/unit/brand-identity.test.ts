import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { deriveIdentityFromLogo, paletteContrast, repaletteFrom } from '@/server/brand/identity';
import { contrastRatio, fromHex, hueDistance, rgbToHsl } from '@/server/brand/color';
import { quantize } from '@/server/brand/quantize';

/**
 * These build real images and decode them through the real pipeline. A fixture
 * of pre-computed swatches would only prove the fixture still matches itself.
 */

async function logo(
  blocks: { colour: [number, number, number]; share: number }[],
  { alpha = 255 } = {},
): Promise<Uint8Array> {
  const size = 64;
  const data = Buffer.alloc(size * size * 4);
  let row = 0;

  for (const block of blocks) {
    const rows = Math.round(size * block.share);
    for (let y = row; y < Math.min(size, row + rows); y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4;
        data[offset] = block.colour[0];
        data[offset + 1] = block.colour[1];
        data[offset + 2] = block.colour[2];
        data[offset + 3] = alpha;
      }
    }
    row += rows;
  }

  return new Uint8Array(
    await sharp(data, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer(),
  );
}

describe('colour quantisation', () => {
  it('separates two flat colours and reports their shares', () => {
    const pixels = [
      ...Array.from({ length: 75 }, () => ({ r: 200, g: 30, b: 40 })),
      ...Array.from({ length: 25 }, () => ({ r: 20, g: 60, b: 180 })),
    ];

    const [first, second] = quantize(pixels, 2);

    expect(first?.weight).toBeCloseTo(0.75, 1);
    expect(second?.weight).toBeCloseTo(0.25, 1);
    expect(hueDistance(rgbToHsl(first!.colour).h, rgbToHsl(second!.colour).h)).toBeGreaterThan(90);
  });

  it('invents nothing from no pixels', () => {
    expect(quantize([], 4)).toEqual([]);
  });
});

describe('identity from a logo', () => {
  it('takes the palette from the logo, not from a platform default', async () => {
    // A deep green mark with a gold detail.
    const identity = await deriveIdentityFromLogo(
      await logo([
        { colour: [17, 71, 46], share: 0.8 },
        { colour: [201, 162, 39], share: 0.2 },
      ]),
    );

    expect(identity.fromLogo).toBe(true);

    const primary = fromHex(identity.palette.primary)!;
    const primaryHue = rgbToHsl(primary).h;

    // Green: hue near 150°, not the default palette's value.
    expect(primaryHue).toBeGreaterThan(100);
    expect(primaryHue).toBeLessThan(190);
    expect(identity.palette.primary).not.toBe('#1F2421');
    expect(identity.extracted.length).toBeGreaterThan(1);
  });

  it('gives two different logos two different identities', async () => {
    const green = await deriveIdentityFromLogo(await logo([{ colour: [17, 71, 46], share: 1 }]));
    const red = await deriveIdentityFromLogo(await logo([{ colour: [176, 34, 28], share: 1 }]));

    expect(green.palette.primary).not.toBe(red.palette.primary);
    expect(green.palette.background).not.toBe(red.palette.background);
  });

  it('derives a companion colour from the logo when it holds only one', async () => {
    const identity = await deriveIdentityFromLogo(
      await logo([{ colour: [176, 34, 28], share: 1 }]),
    );

    const primaryHue = rgbToHsl(fromHex(identity.palette.primary)!).h;
    const accentHue = rgbToHsl(fromHex(identity.palette.accent)!).h;

    // Related to the mark, not lifted from a stock palette.
    expect(hueDistance(primaryHue, accentHue)).toBeGreaterThan(60);
    expect(identity.palette.accent).not.toBe('#C9A227');
  });

  it('guarantees readable text whatever the logo contains', async () => {
    for (const colour of [
      [255, 244, 200],
      [17, 17, 17],
      [120, 200, 255],
      [90, 20, 140],
    ] as [number, number, number][]) {
      const identity = await deriveIdentityFromLogo(await logo([{ colour, share: 1 }]));
      const contrast = paletteContrast(identity.palette)!;

      expect(contrast.text).toBeGreaterThanOrEqual(7);
      expect(contrast.muted).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('reads a dark mark as a dark menu', async () => {
    const dark = await deriveIdentityFromLogo(await logo([{ colour: [12, 14, 18], share: 1 }]));
    const light = await deriveIdentityFromLogo(await logo([{ colour: [246, 240, 230], share: 1 }]));

    expect(dark.tone).toBe('dark');
    expect(light.tone).toBe('light');
  });

  it('describes mood from measurements it can defend', async () => {
    const warm = await deriveIdentityFromLogo(await logo([{ colour: [214, 92, 30], share: 1 }]));
    expect(warm.mood).toContain('warm');

    const cool = await deriveIdentityFromLogo(await logo([{ colour: [30, 90, 200], share: 1 }]));
    expect(cool.mood).toContain('cool');
  });

  it('says so rather than inventing a brand when the logo is unreadable', async () => {
    const identity = await deriveIdentityFromLogo(new TextEncoder().encode('not an image'));

    expect(identity.fromLogo).toBe(false);
    expect(identity.note).toMatch(/could not be read/i);
    expect(identity.palette.primary).toBe('#1F2421');
  });

  it('says so when the logo is transparent padding', async () => {
    const identity = await deriveIdentityFromLogo(
      await logo([{ colour: [17, 71, 46], share: 1 }], { alpha: 0 }),
    );

    expect(identity.fromLogo).toBe(false);
    expect(identity.note).toMatch(/transparent/i);
  });

  it('is stable: the same logo at two sizes yields the same identity', async () => {
    const source = await logo([
      { colour: [17, 71, 46], share: 0.7 },
      { colour: [201, 162, 39], share: 0.3 },
    ]);

    const large = new Uint8Array(await sharp(Buffer.from(source)).resize(512, 512).png().toBuffer());
    const small = new Uint8Array(await sharp(Buffer.from(source)).resize(96, 96).png().toBuffer());

    const a = await deriveIdentityFromLogo(large);
    const b = await deriveIdentityFromLogo(small);

    expect(a.palette).toEqual(b.palette);
    expect(a.tone).toBe(b.tone);
  });
});

describe('operator overrides', () => {
  it('re-derives the supporting colours around a hand-picked primary', () => {
    const palette = repaletteFrom('#7B2D8E', '#2D8E7B', '#8E7B2D', 'light')!;

    expect(palette.primary).toBe('#7B2D8E');
    expect(contrastRatio(fromHex(palette.text)!, fromHex(palette.background)!)).toBeGreaterThanOrEqual(7);
  });

  it('rejects a malformed colour instead of guessing one', () => {
    expect(repaletteFrom('not-a-colour', '#2D8E7B', '#8E7B2D', 'light')).toBeNull();
  });
});
