import { describe, expect, it } from 'vitest';
import { PRINT_PIECES, renderPiece, renderPrintKit } from '@/server/qr/print-kit';
import { renderQr } from '@/server/qr/service';
import { resetEnvCache } from '@/lib/env';

process.env.PUBLIC_URL = 'https://menu.example.com';
resetEnvCache();

const OPTIONS = {
  publicId: 'DEM001',
  businessName: 'Nour Restaurant',
  promptAr: 'امسح لعرض القائمة',
  promptEn: 'Scan for the menu',
};

describe('QR print kit', () => {
  it('renders every piece at a real physical size', async () => {
    const { pieces } = await renderPrintKit(OPTIONS);

    expect(pieces).toHaveLength(PRINT_PIECES.length);

    for (const piece of pieces) {
      // A print shop must receive a file that is already the right size.
      expect(piece.svg).toContain(`width="${piece.widthMm}mm"`);
      expect(piece.svg).toContain(`height="${piece.heightMm}mm"`);
    }
  });

  it('gives every piece the identical destination', async () => {
    const { symbol, pieces } = await renderPrintKit(OPTIONS);

    // The one failure this product cannot have: two cards pointing to
    // different places.
    for (const piece of pieces) {
      expect(piece.svg).toContain(symbol.destination);
    }

    expect(symbol.destination).toBe('https://menu.example.com/m/DEM001');
  });

  it('encodes a branch destination when one is given', async () => {
    const { symbol } = await renderPrintKit({ ...OPTIONS, branchKey: 'olaya' });

    expect(symbol.destination).toBe('https://menu.example.com/m/DEM001/b/olaya');
  });

  it('renders a symbol that passes its own readability validation', async () => {
    const { symbol } = await renderPrintKit(OPTIONS);

    // The kit asks for the highest error correction, because print gets
    // scuffed; the symbol still has to satisfy the contrast and quiet-zone
    // rules the QR service enforces everywhere else.
    expect(symbol.validation.ok).toBe(true);
  });

  it('carries both languages, Arabic first', async () => {
    const { pieces } = await renderPrintKit(OPTIONS);
    const card = pieces.find((piece) => piece.key === 'table-card')!;

    expect(card.svg).toContain('امسح لعرض القائمة');
    expect(card.svg).toContain('Scan for the menu');
    expect(card.svg).toContain('direction="rtl"');

    // Arabic appears before English in the document, as it does on the profile.
    expect(card.svg.indexOf('امسح')).toBeLessThan(card.svg.indexOf('Scan for'));
  });

  it('escapes a business name that contains markup', async () => {
    const { pieces } = await renderPrintKit({
      ...OPTIONS,
      businessName: 'Bob & <script>alert(1)</script>',
    });

    for (const piece of pieces) {
      expect(piece.svg).not.toContain('<script>');
      expect(piece.svg).toContain('&amp;');
    }
  });

  it('keeps the symbol square inside every rectangle', async () => {
    const symbol = await renderQr({ publicId: 'DEM001' });

    for (const piece of PRINT_PIECES) {
      const svg = renderPiece(piece, symbol, OPTIONS);
      const nested = /<svg x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg)!;

      const width = Number(nested[3]);
      const height = Number(nested[4]);
      const x = Number(nested[1]);
      const y = Number(nested[2]);

      expect(width).toBe(height);
      // And it sits inside the piece, with room left for the caption.
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(piece.widthMm);
      expect(y + height).toBeLessThan(piece.heightMm);
    }
  });

  it('gives the window sticker a larger symbol, since it is read from outside', async () => {
    const symbol = await renderQr({ publicId: 'DEM001' });

    const sticker = PRINT_PIECES.find((piece) => piece.key === 'window-sticker')!;
    const counter = PRINT_PIECES.find((piece) => piece.key === 'counter-card')!;

    const sizeOf = (piece: typeof sticker) => {
      const svg = renderPiece(piece, symbol, OPTIONS);
      const width = Number(/<svg x="[\d.]+" y="[\d.]+" width="([\d.]+)"/.exec(svg)![1]);
      return width / Math.min(piece.widthMm, piece.heightMm);
    };

    expect(sizeOf(sticker)).toBeGreaterThan(sizeOf(counter));
  });

  it('produces well-formed SVG for every piece', async () => {
    const { pieces } = await renderPrintKit(OPTIONS);

    for (const piece of pieces) {
      expect(piece.svg.startsWith('<svg')).toBe(true);
      expect(piece.svg.trimEnd().endsWith('</svg>')).toBe(true);

      // Balanced tags: the nested symbol must be closed.
      const opens = (piece.svg.match(/<svg/g) ?? []).length;
      const closes = (piece.svg.match(/<\/svg>/g) ?? []).length;
      expect(opens).toBe(closes);
    }
  });

  it('offers the pieces a restaurant actually needs', () => {
    const keys = PRINT_PIECES.map((piece) => piece.key);

    expect(keys).toContain('table-card');
    expect(keys).toContain('counter-card');
    expect(keys).toContain('window-sticker');
    expect(keys).toContain('poster-a5');
    expect(keys).toContain('poster-a4');
  });

  it('uses real A-series dimensions for the posters', () => {
    const a4 = PRINT_PIECES.find((piece) => piece.key === 'poster-a4')!;
    const a5 = PRINT_PIECES.find((piece) => piece.key === 'poster-a5')!;

    expect([a4.widthMm, a4.heightMm]).toEqual([210, 297]);
    expect([a5.widthMm, a5.heightMm]).toEqual([148, 210]);
  });
});
