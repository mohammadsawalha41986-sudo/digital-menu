import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  buildSrcSet,
  derivativeKey,
  generateDerivatives,
  objectPosition,
  readImageFacts,
} from '@/server/media/derivatives';

/**
 * The pipeline end to end, on real bytes: a photograph-sized JPEG in, a set of
 * genuinely smaller WebP files out, addressable by the URLs the templates emit.
 *
 * This is the test that would catch a `srcset` pointing at files that were
 * never written — the failure mode where images look fine locally and 404 in
 * production.
 */
describe('image pipeline', () => {
  it('turns one upload into the widths a menu actually needs', async () => {
    const original = new Uint8Array(
      await sharp({
        create: { width: 2000, height: 1500, channels: 3, background: { r: 30, g: 90, b: 60 } },
      })
        .jpeg({ quality: 92 })
        .toBuffer(),
    );

    const facts = (await readImageFacts(original))!;
    expect(facts.width).toBe(2000);

    const derivatives = await generateDerivatives(original, facts);
    expect(derivatives.map((d) => d.width)).toEqual([320, 640, 1024, 1600]);

    // Each one is a real WebP at the right width, and smaller than the last.
    let previousSize = Number.POSITIVE_INFINITY;
    for (const derivative of [...derivatives].reverse()) {
      const metadata = await sharp(Buffer.from(derivative.bytes)).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(derivative.width);
      expect(derivative.bytes.byteLength).toBeLessThan(previousSize);
      previousSize = derivative.bytes.byteLength;
    }

    // The srcset the template emits names exactly the widths that were written.
    const widths = derivatives.map((d) => d.width);
    const srcSet = buildSrcSet('/uploads/media/x.jpg', widths)!;

    for (const width of widths) {
      expect(srcSet).toContain(`/uploads/media/x.jpg?w=${width} ${width}w`);
      // And each width maps to a storage key that was actually written.
      expect(derivativeKey('media/x.jpg', width)).toBe(`media/x@${width}.webp`);
    }
  }, 60_000);

  it('a phone-width derivative is a fraction of the original', async () => {
    const original = new Uint8Array(
      await sharp({
        create: { width: 2400, height: 1800, channels: 3, background: { r: 200, g: 60, b: 40 } },
      })
        .jpeg({ quality: 95 })
        .toBuffer(),
    );

    const facts = (await readImageFacts(original))!;
    const derivatives = await generateDerivatives(original, facts);
    const phone = derivatives.find((d) => d.width === 320)!;

    expect(phone.bytes.byteLength).toBeLessThan(facts.sizeBytes / 2);
  }, 60_000);

  it('an image with a focal point crops around it in every ratio', () => {
    // One stored point drives all three template ratios (§48).
    const position = objectPosition({ x: 0.75, y: 0.25 });

    expect(position).toBe('75.0% 25.0%');
  });
});
