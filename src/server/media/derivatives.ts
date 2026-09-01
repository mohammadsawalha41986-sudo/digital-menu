import sharp from 'sharp';

/**
 * Responsive image derivatives and quality assessment
 * (master spec §49, §50, §88).
 *
 * The platform served every image exactly as uploaded: a 4 MB photograph from
 * a phone camera went to a visitor on mobile data unchanged. `sharp` was
 * already a dependency — used for logo colour extraction — so the pipeline
 * needed building, not the tool choosing.
 *
 * Decisions worth stating:
 *
 *  - **WebP, not AVIF.** AVIF encodes smaller but costs an order of magnitude
 *    more CPU per image, and this runs inside the request path of an admin
 *    upload. WebP is universally supported by every browser that will ever
 *    scan a QR code, and the saving over the original JPEG is already large.
 *    AVIF becomes worth it behind a queue, which is a later change.
 *
 *  - **Never upscale.** A 400px-wide upload gets one derivative, not four.
 *    Generating a 1600px version of a small image makes a bigger file that
 *    looks no better.
 *
 *  - **Originals are never modified.** Derivatives are additional objects.
 *    §96 requires it, and it is also what makes a focal point re-editable.
 */

/** Widths that matter: a phone, a large phone, a tablet, a desktop. */
export const DERIVATIVE_WIDTHS = [320, 640, 1024, 1600] as const;

/** Formats we will derive from. An SVG is already resolution-independent. */
const RASTER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function supportsDerivatives(contentType: string): boolean {
  return RASTER_TYPES.has(contentType);
}

export interface Derivative {
  width: number;
  bytes: Uint8Array;
  contentType: 'image/webp';
}

export interface ImageFacts {
  width: number;
  height: number;
  /** Bytes of the original upload. */
  sizeBytes: number;
}

/**
 * Reads dimensions without decoding the whole image.
 * Returns null for anything sharp cannot parse, rather than throwing: a bad
 * upload is a validation problem, not a crash.
 */
export async function readImageFacts(bytes: Uint8Array): Promise<ImageFacts | null> {
  try {
    const metadata = await sharp(Buffer.from(bytes)).metadata();
    if (!metadata.width || !metadata.height) return null;

    return { width: metadata.width, height: metadata.height, sizeBytes: bytes.byteLength };
  } catch {
    return null;
  }
}

/**
 * Generates the derivatives an image actually warrants.
 *
 * Sequential rather than parallel on purpose: four concurrent sharp pipelines
 * on a shared container is how an upload starves the request handling the
 * page someone is reading.
 */
export async function generateDerivatives(
  bytes: Uint8Array,
  facts: ImageFacts,
): Promise<Derivative[]> {
  const widths = DERIVATIVE_WIDTHS.filter((width) => width < facts.width);
  const derivatives: Derivative[] = [];

  for (const width of widths) {
    const output = await sharp(Buffer.from(bytes))
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    derivatives.push({ width, bytes: new Uint8Array(output), contentType: 'image/webp' });
  }

  return derivatives;
}

/* -------------------------------------------------------------------------- */
/* Quality assessment (§49)                                                   */
/* -------------------------------------------------------------------------- */

export type QualityLevel = 'GOOD' | 'FAIR' | 'POOR';

export interface QualityReport {
  level: QualityLevel;
  /** Plain sentences for an operator, not field names. */
  notes: string[];
}

/** Below this, an image is visibly soft on a modern phone at full width. */
const MIN_GOOD_WIDTH = 1000;
const MIN_FAIR_WIDTH = 600;
/** Beyond this a file is worth re-exporting even after derivatives exist. */
const LARGE_FILE_BYTES = 3_000_000;
/** A panorama or a sliver crops badly into every template ratio. */
const EXTREME_RATIO = 3;

export function assessQuality(facts: ImageFacts): QualityReport {
  const notes: string[] = [];
  let level: QualityLevel = 'GOOD';

  const ratio = facts.width / facts.height;

  if (facts.width < MIN_FAIR_WIDTH) {
    level = 'POOR';
    notes.push(
      `Only ${facts.width}px wide. This will look soft wherever it is shown large.`,
    );
  } else if (facts.width < MIN_GOOD_WIDTH) {
    level = 'FAIR';
    notes.push(`${facts.width}px wide — fine in a list, soft as a full-width image.`);
  }

  if (ratio > EXTREME_RATIO || ratio < 1 / EXTREME_RATIO) {
    if (level === 'GOOD') level = 'FAIR';
    notes.push(
      'Unusually long or tall. Templates that crop to a square will lose most of it — set a focal point.',
    );
  }

  if (facts.sizeBytes > LARGE_FILE_BYTES) {
    notes.push(
      `${(facts.sizeBytes / 1_000_000).toFixed(1)} MB. Smaller versions are served to visitors, so this costs storage rather than speed.`,
    );
  }

  if (notes.length === 0) notes.push('Good quality at every size the templates use.');

  return { level, notes };
}

/* -------------------------------------------------------------------------- */
/* Focal points (§47, §48)                                                    */
/* -------------------------------------------------------------------------- */

export interface FocalPoint {
  x: number;
  y: number;
}

export const FOCAL_PRESETS: Record<string, FocalPoint> = {
  centre: { x: 0.5, y: 0.5 },
  top: { x: 0.5, y: 0.2 },
  bottom: { x: 0.5, y: 0.8 },
  left: { x: 0.2, y: 0.5 },
  right: { x: 0.8, y: 0.5 },
};

/** Clamps whatever arrives from a form into the unit square. */
export function normaliseFocal(x: unknown, y: unknown): FocalPoint | null {
  const fx = Number(x);
  const fy = Number(y);

  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;

  return { x: Math.min(1, Math.max(0, fx)), y: Math.min(1, Math.max(0, fy)) };
}

/**
 * Turns a focal point into a CSS `object-position`.
 *
 * This is how one uploaded image serves 1:1, 4:5 and 16:9 without the operator
 * uploading three copies (§48): the browser crops, and the focal point tells it
 * what to keep. Doing it in CSS rather than by generating cropped files means a
 * changed focal point takes effect immediately and costs no storage.
 */
export function objectPosition(focal: FocalPoint | null): string {
  const point = focal ?? FOCAL_PRESETS.centre!;
  return `${(point.x * 100).toFixed(1)}% ${(point.y * 100).toFixed(1)}%`;
}

/** Builds the `srcset` for an image, given the widths actually generated. */
export function buildSrcSet(baseUrl: string, widths: readonly number[]): string | null {
  if (widths.length === 0) return null;

  return [...widths]
    .sort((a, b) => a - b)
    .map((width) => `${derivativeUrl(baseUrl, width)} ${width}w`)
    .join(', ');
}

/** Derivative URLs are the original's, with a width suffix before the extension. */
export function derivativeUrl(baseUrl: string, width: number): string {
  return `${baseUrl}?w=${width}`;
}

/** Storage key for a derivative, derived from the original's key. */
export function derivativeKey(storageKey: string, width: number): string {
  const dot = storageKey.lastIndexOf('.');
  const stem = dot === -1 ? storageKey : storageKey.slice(0, dot);
  return `${stem}@${width}.webp`;
}
