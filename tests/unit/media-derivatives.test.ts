import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  DERIVATIVE_WIDTHS,
  assessQuality,
  buildSrcSet,
  derivativeKey,
  generateDerivatives,
  normaliseFocal,
  objectPosition,
  readImageFacts,
  supportsDerivatives,
} from '@/server/media/derivatives';

/** A real encoded image, so the pipeline is exercised rather than mocked. */
async function makeImage(width: number, height: number) {
  return new Uint8Array(
    await sharp({
      create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } },
    })
      .jpeg()
      .toBuffer(),
  );
}

describe('image facts', () => {
  it('reads real dimensions from real bytes', async () => {
    const facts = await readImageFacts(await makeImage(1200, 800));

    expect(facts?.width).toBe(1200);
    expect(facts?.height).toBe(800);
    expect(facts?.sizeBytes).toBeGreaterThan(0);
  });

  it('returns null for bytes that are not an image, rather than throwing', async () => {
    expect(await readImageFacts(new TextEncoder().encode('not an image'))).toBeNull();
  });
});

describe('derivatives', () => {
  it('generates smaller widths and never a larger one', async () => {
    const bytes = await makeImage(1200, 800);
    const facts = (await readImageFacts(bytes))!;

    const derivatives = await generateDerivatives(bytes, facts);

    expect(derivatives.map((d) => d.width)).toEqual([320, 640, 1024]);
    for (const derivative of derivatives) {
      expect(derivative.width).toBeLessThan(facts.width);
    }
  }, 30_000);

  it('produces WebP that is genuinely smaller than the original', async () => {
    const bytes = await makeImage(1600, 1200);
    const facts = (await readImageFacts(bytes))!;

    const derivatives = await generateDerivatives(bytes, facts);
    const smallest = derivatives.find((d) => d.width === 320)!;

    expect(smallest.contentType).toBe('image/webp');
    expect(smallest.bytes.byteLength).toBeLessThan(facts.sizeBytes);

    // And it really is a WebP, not a renamed JPEG.
    const metadata = await sharp(Buffer.from(smallest.bytes)).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(320);
  }, 30_000);

  it('never upscales a small image', async () => {
    const bytes = await makeImage(400, 300);
    const facts = (await readImageFacts(bytes))!;

    const derivatives = await generateDerivatives(bytes, facts);

    expect(derivatives.map((d) => d.width)).toEqual([320]);
  }, 30_000);

  it('derives nothing at all from an image smaller than the smallest width', async () => {
    const bytes = await makeImage(200, 150);
    const facts = (await readImageFacts(bytes))!;

    expect(await generateDerivatives(bytes, facts)).toEqual([]);
  }, 30_000);

  it('knows which formats it can derive from', () => {
    expect(supportsDerivatives('image/jpeg')).toBe(true);
    expect(supportsDerivatives('image/png')).toBe(true);
    // An SVG is already resolution-independent; rasterising it is a downgrade.
    expect(supportsDerivatives('image/svg+xml')).toBe(false);
  });

  it('names a derivative from its original without colliding', () => {
    expect(derivativeKey('media/abc.jpg', 640)).toBe('media/abc@640.webp');
    expect(derivativeKey('media/abc', 640)).toBe('media/abc@640.webp');
    expect(derivativeKey('media/abc.jpg', 320)).not.toBe(derivativeKey('media/abc.jpg', 640));
  });

  it('builds a srcset only when derivatives exist', () => {
    expect(buildSrcSet('/uploads/a.jpg', [320, 640])).toBe(
      '/uploads/a.jpg?w=320 320w, /uploads/a.jpg?w=640 640w',
    );
    expect(buildSrcSet('/uploads/a.jpg', [])).toBeNull();
  });

  it('offers the widths a phone, a tablet and a desktop actually need', () => {
    expect(DERIVATIVE_WIDTHS).toEqual([320, 640, 1024, 1600]);
  });
});

describe('quality assessment', () => {
  it('passes a well-sized photograph', () => {
    const report = assessQuality({ width: 1600, height: 1200, sizeBytes: 400_000 });

    expect(report.level).toBe('GOOD');
  });

  it('warns that a small image will look soft', () => {
    const report = assessQuality({ width: 700, height: 500, sizeBytes: 90_000 });

    expect(report.level).toBe('FAIR');
    expect(report.notes.join(' ')).toMatch(/soft/);
  });

  it('calls a very small image poor', () => {
    expect(assessQuality({ width: 300, height: 200, sizeBytes: 20_000 }).level).toBe('POOR');
  });

  it('flags an extreme ratio and suggests the actual remedy', () => {
    const report = assessQuality({ width: 3000, height: 500, sizeBytes: 500_000 });

    expect(report.notes.join(' ')).toMatch(/focal point/);
  });

  it('mentions a huge file without calling it a quality problem', () => {
    const report = assessQuality({ width: 2400, height: 1800, sizeBytes: 5_000_000 });

    // Derivatives mean the visitor never downloads it, so this is not POOR.
    expect(report.level).toBe('GOOD');
    expect(report.notes.join(' ')).toMatch(/MB/);
  });

  it('always says something, so the panel is never blank', () => {
    expect(assessQuality({ width: 1200, height: 900, sizeBytes: 200_000 }).notes.length)
      .toBeGreaterThan(0);
  });
});

describe('focal points', () => {
  it('turns a focal point into a CSS object-position', () => {
    expect(objectPosition({ x: 0.5, y: 0.5 })).toBe('50.0% 50.0%');
    expect(objectPosition({ x: 0.2, y: 0.8 })).toBe('20.0% 80.0%');
  });

  it('centres when nothing has been chosen', () => {
    expect(objectPosition(null)).toBe('50.0% 50.0%');
  });

  it('clamps values from a form into the image', () => {
    expect(normaliseFocal(1.4, -0.2)).toEqual({ x: 1, y: 0 });
    expect(normaliseFocal('0.25', '0.75')).toEqual({ x: 0.25, y: 0.75 });
  });

  it('rejects values that are not numbers', () => {
    expect(normaliseFocal('left', 'top')).toBeNull();
    expect(normaliseFocal(null, undefined)).toBeNull();
  });
});
