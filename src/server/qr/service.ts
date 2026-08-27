import QRCode from 'qrcode';
import { assertPermanentDestination, buildQrDestination } from './destination';
import { validateQr, type QrValidationResult } from './validation';

/**
 * QR rendering (master spec §12, §13).
 *
 * Four artwork styles are supported — bare symbol, symbol with a logo, symbol
 * with the business name, symbol with a scan prompt — and **all four encode
 * exactly the same payload**. Artwork is presentation; the destination is the
 * contract. That separation is what lets staff reprint a prettier card without
 * invalidating anything already on a table (GOALS I2).
 */

export type QrArtwork = 'plain' | 'with-logo' | 'with-name' | 'with-prompt';
export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

export interface QrRenderOptions {
  publicId: string;
  branchKey?: string | null;
  artwork?: QrArtwork;
  /** Dark module colour. Defaults to near-black rather than pure brand colour. */
  foreground?: string;
  background?: string;
  sizePx?: number;
  errorCorrection?: QrErrorCorrection;
  /** Data URI for the centre logo; only used by the `with-logo` artwork. */
  logoDataUri?: string | null;
  /** Caption lines, already localised by the caller. */
  captionPrimary?: string | null;
  captionSecondary?: string | null;
  /** Caption text direction, so Arabic captions render correctly. */
  direction?: 'rtl' | 'ltr';
}

export interface QrRenderResult {
  destination: string;
  svg: string;
  validation: QrValidationResult;
  artwork: QrArtwork;
}

const DEFAULT_FOREGROUND = '#111111';
const DEFAULT_BACKGROUND = '#FFFFFF';
const DEFAULT_SIZE = 512;
const QUIET_ZONE_MODULES = 4;

/** Fraction of the symbol width a centre logo occupies. */
const LOGO_WIDTH_FRACTION = 0.22;

export async function renderQr(options: QrRenderOptions): Promise<QrRenderResult> {
  const destination = buildQrDestination({
    publicId: options.publicId,
    branchKey: options.branchKey,
  });

  // Belt and braces: the builder can only produce permanent paths, and this
  // re-checks the result before a single pixel is rendered.
  assertPermanentDestination(destination);

  const artwork = options.artwork ?? 'plain';
  const foreground = options.foreground ?? DEFAULT_FOREGROUND;
  const background = options.background ?? DEFAULT_BACKGROUND;
  const sizePx = options.sizePx ?? DEFAULT_SIZE;
  // A logo punches a hole in the symbol, so encode with the headroom to
  // recover it rather than hoping.
  const errorCorrection =
    options.errorCorrection ?? (artwork === 'with-logo' ? 'H' : 'M');

  const validation = validateQr({
    foreground,
    background,
    quietZoneModules: QUIET_ZONE_MODULES,
    sizePx,
    hasLogo: artwork === 'with-logo' && Boolean(options.logoDataUri),
    logoCoverage: LOGO_WIDTH_FRACTION ** 2,
    errorCorrection,
  });

  const symbolSvg = await QRCode.toString(destination, {
    type: 'svg',
    errorCorrectionLevel: errorCorrection,
    margin: QUIET_ZONE_MODULES,
    width: sizePx,
    color: { dark: foreground, light: background },
  });

  const svg = composeArtwork(symbolSvg, { ...options, artwork, sizePx, foreground, background });

  return { destination, svg, validation, artwork };
}

/** Renders the same symbol as a PNG buffer for print workflows. */
export async function renderQrPng(options: QrRenderOptions): Promise<Buffer> {
  const destination = buildQrDestination({
    publicId: options.publicId,
    branchKey: options.branchKey,
  });
  assertPermanentDestination(destination);

  return QRCode.toBuffer(destination, {
    type: 'png',
    errorCorrectionLevel: options.errorCorrection ?? 'M',
    margin: QUIET_ZONE_MODULES,
    width: options.sizePx ?? DEFAULT_SIZE,
    color: {
      dark: options.foreground ?? DEFAULT_FOREGROUND,
      light: options.background ?? DEFAULT_BACKGROUND,
    },
  });
}

interface ComposeOptions extends QrRenderOptions {
  artwork: QrArtwork;
  sizePx: number;
  foreground: string;
  background: string;
}

/**
 * Wraps the bare symbol in a card. Kept as string composition rather than a
 * rendering library so the output is a plain, printable SVG with no runtime.
 */
function composeArtwork(symbolSvg: string, options: ComposeOptions): string {
  if (options.artwork === 'plain') return symbolSvg;

  const { sizePx, background, foreground } = options;
  const padding = Math.round(sizePx * 0.08);
  // `plain` returned above; a logo card carries no caption.
  const captionHeight = options.artwork === 'with-logo' ? 0 : Math.round(sizePx * 0.18);

  const width = sizePx + padding * 2;
  const height = sizePx + padding * 2 + captionHeight;

  const inner = extractSvgInner(symbolSvg);
  const isRtl = options.direction === 'rtl';

  const logo =
    options.artwork === 'with-logo' && options.logoDataUri
      ? renderCentreLogo(options.logoDataUri, sizePx, padding, background)
      : '';

  const caption = captionHeight > 0 ? renderCaption(options, width, sizePx, padding, foreground, isRtl) : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="QR code">`,
    `<rect width="${width}" height="${height}" fill="${background}"/>`,
    `<g transform="translate(${padding} ${padding})">${inner}</g>`,
    logo,
    caption,
    '</svg>',
  ].join('');
}

function renderCentreLogo(
  dataUri: string,
  sizePx: number,
  padding: number,
  background: string,
): string {
  const logoSize = Math.round(sizePx * LOGO_WIDTH_FRACTION);
  const plateSize = Math.round(logoSize * 1.2);
  const centre = padding + sizePx / 2;

  return [
    // A plate behind the logo keeps module edges crisp; error correction
    // recovers the covered modules.
    `<rect x="${centre - plateSize / 2}" y="${centre - plateSize / 2}" width="${plateSize}" height="${plateSize}" rx="${Math.round(plateSize * 0.12)}" fill="${background}"/>`,
    `<image x="${centre - logoSize / 2}" y="${centre - logoSize / 2}" width="${logoSize}" height="${logoSize}" href="${escapeAttribute(dataUri)}" preserveAspectRatio="xMidYMid meet"/>`,
  ].join('');
}

function renderCaption(
  options: ComposeOptions,
  width: number,
  sizePx: number,
  padding: number,
  foreground: string,
  isRtl: boolean,
): string {
  const primary = options.captionPrimary?.trim();
  const secondary = options.captionSecondary?.trim();
  if (!primary && !secondary) return '';

  const baseY = padding + sizePx + Math.round(sizePx * 0.11);
  const lineHeight = Math.round(sizePx * 0.07);
  const fontSize = Math.round(sizePx * 0.055);
  const direction = isRtl ? 'rtl' : 'ltr';

  const lines: string[] = [];

  if (primary) {
    lines.push(
      `<text x="${width / 2}" y="${baseY}" text-anchor="middle" direction="${direction}" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="600" fill="${foreground}">${escapeText(primary)}</text>`,
    );
  }

  if (secondary) {
    lines.push(
      `<text x="${width / 2}" y="${baseY + lineHeight}" text-anchor="middle" direction="${direction}" font-family="system-ui, sans-serif" font-size="${Math.round(fontSize * 0.8)}" fill="${foreground}" opacity="0.72">${escapeText(secondary)}</text>`,
    );
  }

  return lines.join('');
}

function extractSvgInner(svg: string): string {
  const match = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(svg);
  return match?.[1] ?? svg;
}

/**
 * Caption text is business-authored and goes into SVG markup, so it is escaped
 * here rather than trusted (master spec §127).
 */
function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/'/g, '&#39;');
}
