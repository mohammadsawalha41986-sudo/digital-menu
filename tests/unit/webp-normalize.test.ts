import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MAX_ORIGINAL_SIDE, normalizeToWebp } from '@/server/media/derivatives';

async function image(width: number, height: number, format: 'png' | 'jpeg' | 'webp', alpha = false) {
  const buffer = await sharp({
    create: { width, height, channels: alpha ? 4 : 3, background: { r: 200, g: 80, b: 40, alpha: alpha ? 0.5 : 1 } },
  })
    [format]()
    .toBuffer();
  return new Uint8Array(buffer);
}

describe('normalizeToWebp', () => {
  it('stores a JPEG upload as WebP', async () => {
    const result = await normalizeToWebp(await image(800, 600, 'jpeg'), 'image/jpeg');

    expect(result?.contentType).toBe('image/webp');
    expect((await sharp(Buffer.from(result!.bytes)).metadata()).format).toBe('webp');
  });

  it('keeps a transparent logo transparent', async () => {
    const result = await normalizeToWebp(await image(400, 400, 'png', true), 'image/png');

    expect((await sharp(Buffer.from(result!.bytes)).metadata()).hasAlpha).toBe(true);
  });

  it('scales an oversized photo down to the longest-side limit', async () => {
    const result = await normalizeToWebp(await image(4000, 3000, 'png'), 'image/png');
    const metadata = await sharp(Buffer.from(result!.bytes)).metadata();

    expect(metadata.width).toBe(MAX_ORIGINAL_SIDE);
    expect(metadata.height).toBe(1500);
  });

  it('leaves a WebP that is already within bounds untouched', async () => {
    expect(await normalizeToWebp(await image(800, 600, 'webp'), 'image/webp')).toBeNull();
  });

  it('never throws on bytes it cannot read', async () => {
    expect(await normalizeToWebp(new Uint8Array([1, 2, 3]), 'image/png')).toBeNull();
  });
});
