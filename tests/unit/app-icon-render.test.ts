import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ICON_MARGIN, iconBackground, renderAppIcon } from '@/server/profile/app-icon-render';

/** A real restaurant logo from the template's assets: 500 × 320, not square. */
const REAL_LOGO = path.join(process.cwd(), 'public/sabah/assets/menu/logo_crop.png');
const PLATFORM_ICON = path.join(process.cwd(), 'public/app-icon.svg');
const BACKGROUND = '#0b0f0c';

/**
 * The rectangle of pixels that are not the background colour: where the
 * artwork was drawn. Measured from the decoded pixels, not from the settings.
 */
async function artworkBox(png: Uint8Array, background: string) {
  const { data, info } = await sharp(Buffer.from(png)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bgR = Number.parseInt(background.slice(1, 3), 16);
  const bgG = Number.parseInt(background.slice(3, 5), 16);
  const bgB = Number.parseInt(background.slice(5, 7), 16);
  let left = Infinity;
  let top = Infinity;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const differs = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB) > 24;
      if (!differs) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1, size: info.width };
}

describe('the menu’s install icon', () => {
  it('is exactly the square size asked for, for each size the browser requests', async () => {
    const logo = await readFile(REAL_LOGO);
    for (const size of [192, 512]) {
      const png = await renderAppIcon({ size, background: BACKGROUND, artwork: new Uint8Array(logo) });
      const meta = await sharp(Buffer.from(png)).metadata();
      expect(meta).toMatchObject({ format: 'png', width: size, height: size });
    }
  });

  it('keeps a wide logo’s proportions: letterboxed, never stretched', async () => {
    const logo = await readFile(REAL_LOGO);
    const png = await renderAppIcon({ size: 512, background: BACKGROUND, artwork: new Uint8Array(logo) });
    const box = await artworkBox(png, BACKGROUND);

    // The logo is 500 × 320. Its drawn box must keep that ratio (±2%).
    const inner = 512 * (1 - 2 * ICON_MARGIN);
    expect(box.width).toBeGreaterThan(inner - 3);
    expect(box.width).toBeLessThan(inner + 3);
    expect(box.width / box.height).toBeCloseTo(500 / 320, 1);
    expect(Math.abs(box.width / box.height - 500 / 320) / (500 / 320)).toBeLessThan(0.02);
  });

  it('centres the logo in the square', async () => {
    const logo = await readFile(REAL_LOGO);
    const png = await renderAppIcon({ size: 192, background: BACKGROUND, artwork: new Uint8Array(logo) });
    const box = await artworkBox(png, BACKGROUND);
    expect(Math.abs(box.left + box.width / 2 - 96)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.top + box.height / 2 - 96)).toBeLessThanOrEqual(1);
  });

  it('draws a vector logo crisply too (the platform icon is an SVG)', async () => {
    const svg = await readFile(PLATFORM_ICON);
    const png = await renderAppIcon({ size: 512, background: BACKGROUND, artwork: new Uint8Array(svg) });
    expect(await sharp(Buffer.from(png)).metadata()).toMatchObject({ width: 512, height: 512 });
  });

  it('refuses bytes that are not an image, so the caller can fall back', async () => {
    await expect(
      renderAppIcon({ size: 192, background: BACKGROUND, artwork: new Uint8Array([1, 2, 3, 4]) }),
    ).rejects.toThrow();
  });

  it('uses the restaurant’s colour when it is a plain hex colour, and a fallback otherwise', () => {
    expect(iconBackground('#ABCDEF')).toBe('#abcdef');
    expect(iconBackground('red')).toBe('#0b0f0c');
    expect(iconBackground('#12345')).toBe('#0b0f0c');
    expect(iconBackground(null)).toBe('#0b0f0c');
    expect(iconBackground('url(javascript:alert(1))')).toBe('#0b0f0c');
  });
});
