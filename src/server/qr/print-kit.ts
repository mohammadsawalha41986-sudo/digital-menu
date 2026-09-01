import { renderQr, type QrRenderResult } from './service';

/**
 * The QR print kit (master spec §123, §124).
 *
 * A managed service hands a restaurant physical things: a card for each table,
 * one for the counter, a sticker for the window, a poster for the wall. Before
 * this, staff downloaded a bare symbol and someone opened a design tool.
 *
 * Everything is generated as **SVG at real physical dimensions**, in
 * millimetres, so a print shop receives a file that is already the right size
 * rather than one that has to be scaled and hoped over. SVG rather than PDF
 * because it needs no renderer in the runtime image, prints at any resolution,
 * and every print shop accepts it.
 *
 * The QR inside each piece is the same permanent symbol as everywhere else —
 * these are layouts around `renderQr`, not a second QR implementation (§164).
 */

export interface PrintPiece {
  key: string;
  label: string;
  /** Finished size in millimetres. */
  widthMm: number;
  heightMm: number;
  description: string;
}

export const PRINT_PIECES: readonly PrintPiece[] = [
  {
    key: 'table-card',
    label: 'Table card',
    widthMm: 100,
    heightMm: 150,
    description: 'Stands on a table. The size most restaurants already have holders for.',
  },
  {
    key: 'counter-card',
    label: 'Counter card',
    widthMm: 105,
    heightMm: 105,
    description: 'Square, for a till or a counter where space is tight.',
  },
  {
    key: 'window-sticker',
    label: 'Window sticker',
    widthMm: 120,
    heightMm: 120,
    description: 'Read from outside, so the prompt is larger and the symbol dominates.',
  },
  {
    key: 'poster-a5',
    label: 'A5 poster',
    widthMm: 148,
    heightMm: 210,
    description: 'Wall or door.',
  },
  {
    key: 'poster-a4',
    label: 'A4 poster',
    widthMm: 210,
    heightMm: 297,
    description: 'Entrance or noticeboard.',
  },
  {
    key: 'social',
    label: 'Social image',
    widthMm: 254, // 1080px at 108dpi — a square social post
    heightMm: 254,
    description: 'For a post or a story. Screen rather than print.',
  },
];

export interface PrintKitOptions {
  publicId: string;
  branchKey?: string | null;
  businessName: string;
  /** Shown under the symbol. Arabic first, because the visitor reads it first. */
  promptAr: string;
  promptEn: string;
  foreground?: string;
  background?: string;
}

/** Extracts the inner markup of a rendered symbol so it can be re-placed. */
function symbolBody(svg: string): { body: string; viewBox: string } {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 100 100';
  const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return { body, viewBox };
}

/** XML-escapes text that came from the database. */
function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Lays out one piece.
 *
 * Proportions rather than fixed sizes: the same layout has to work on a 100mm
 * card and a 297mm poster, and a symbol sized for one is unreadable or absurd
 * on the other. The quiet zone comes from the symbol itself and is never
 * trimmed — cropping it is the single most common way a printed QR stops
 * scanning.
 */
export function renderPiece(
  piece: PrintPiece,
  symbol: QrRenderResult,
  options: PrintKitOptions,
): string {
  const { body, viewBox } = symbolBody(symbol.svg);

  const foreground = options.foreground ?? '#000000';
  const background = options.background ?? '#FFFFFF';

  // The window sticker is read from a distance, so it gives more room to the
  // symbol and less to the words.
  const symbolShare = piece.key === 'window-sticker' ? 0.7 : 0.58;
  const symbolSize = Math.min(piece.widthMm, piece.heightMm) * symbolShare;
  const symbolX = (piece.widthMm - symbolSize) / 2;
  const symbolY = piece.heightMm * (piece.key === 'social' ? 0.16 : 0.14);

  const nameSize = piece.widthMm * 0.062;
  const promptSize = piece.widthMm * 0.048;
  const urlSize = piece.widthMm * 0.032;

  const afterSymbol = symbolY + symbolSize;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${piece.widthMm}mm" height="${piece.heightMm}mm" viewBox="0 0 ${piece.widthMm} ${piece.heightMm}" role="img" aria-label="${escape(options.businessName)} menu QR code">
  <rect width="${piece.widthMm}" height="${piece.heightMm}" fill="${background}"/>
  <text x="${piece.widthMm / 2}" y="${piece.heightMm * 0.085}" text-anchor="middle" font-family="Amiri, Georgia, serif" font-size="${nameSize}" fill="${foreground}">${escape(options.businessName)}</text>
  <svg x="${symbolX}" y="${symbolY}" width="${symbolSize}" height="${symbolSize}" viewBox="${viewBox}">${body}</svg>
  <text x="${piece.widthMm / 2}" y="${afterSymbol + promptSize * 1.5}" text-anchor="middle" font-family="Cairo, sans-serif" font-size="${promptSize}" fill="${foreground}" direction="rtl">${escape(options.promptAr)}</text>
  <text x="${piece.widthMm / 2}" y="${afterSymbol + promptSize * 2.9}" text-anchor="middle" font-family="Inter, sans-serif" font-size="${promptSize}" fill="${foreground}">${escape(options.promptEn)}</text>
  <text x="${piece.widthMm / 2}" y="${piece.heightMm - urlSize * 1.4}" text-anchor="middle" font-family="Inter, sans-serif" font-size="${urlSize}" fill="${foreground}" opacity="0.65">${escape(symbol.destination)}</text>
</svg>`;
}

export interface RenderedPiece extends PrintPiece {
  svg: string;
}

/**
 * Renders the whole kit.
 *
 * The symbol is rendered **once** and re-placed into each layout, so every
 * piece in the kit provably encodes the identical destination. Rendering per
 * piece would let a future change make one card point somewhere else, which is
 * the one failure this product cannot have (GOALS I1, I2).
 */
export async function renderPrintKit(
  options: PrintKitOptions,
): Promise<{ symbol: QrRenderResult; pieces: RenderedPiece[] }> {
  const symbol = await renderQr({
    publicId: options.publicId,
    branchKey: options.branchKey ?? null,
    artwork: 'plain',
    foreground: options.foreground,
    background: options.background,
    // Print is unforgiving and a card gets scuffed; the highest correction
    // level costs a denser symbol and buys damage tolerance.
    errorCorrection: 'H',
  });

  return {
    symbol,
    pieces: PRINT_PIECES.map((piece) => ({
      ...piece,
      svg: renderPiece(piece, symbol, options),
    })),
  };
}
