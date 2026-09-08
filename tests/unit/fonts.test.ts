import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_FACES, preloadFontsFor, resolveFont } from '@/menu-studio/typography';
import { brandTokensToStyle } from '@/design/brand';

const ROOT = process.cwd();
const FONT_CSS = readFileSync(path.join(ROOT, 'src/design/fonts.css'), 'utf8');

describe('shipped webfonts', () => {
  it('every family a face names has @font-face rules', () => {
    for (const face of FONT_FACES) {
      if (!face.family) continue;
      expect(FONT_CSS, `${face.key} → ${face.family}`).toContain(`font-family: '${face.family}'`);
    }
  });

  it('every file the stylesheet references exists on disk', () => {
    const referenced = [...FONT_CSS.matchAll(/url\((\/fonts\/[^)]+)\)/g)].map((m) => m[1]!);

    expect(referenced.length).toBeGreaterThan(20);

    for (const href of referenced) {
      expect(existsSync(path.join(ROOT, 'public', href)), href).toBe(true);
    }
  });

  it('ships an Arabic subset for every Arabic-capable family', () => {
    const arabicFamilies = FONT_FACES.filter(
      (face) => face.family && face.scripts.includes('arabic'),
    );

    expect(arabicFamilies.length).toBeGreaterThan(0);

    for (const face of arabicFamilies) {
      const file = `/fonts/${face.family!.toLowerCase().replace(/\s+/g, '-')}-400-arabic.woff2`;
      expect(existsSync(path.join(ROOT, 'public', file)), file).toBe(true);
    }
  });

  it('every face swaps rather than blocking, so text is never invisible', () => {
    const faces = FONT_CSS.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(faces.length).toBeGreaterThan(20);
    for (const face of faces) expect(face).toContain('font-display: swap');
  });

  it('keeps the unicode ranges that make subsetting work', () => {
    // Without these a Latin reader downloads the Arabic subset and the reverse.
    expect(FONT_CSS).toContain('unicode-range: U+0600-06FF');
  });

  it('every stack ends in a generic family, so a failed load still has shapes', () => {
    for (const face of FONT_FACES) {
      expect(face.stack, face.key).toMatch(/(serif|sans-serif|monospace)\s*$/);
    }
  });

  it('every Arabic-capable stack names an Arabic fallback', () => {
    for (const face of FONT_FACES.filter((f) => f.scripts.includes('arabic'))) {
      expect(face.stack, face.key).toMatch(/Arabic|Amiri|Cairo|Tajawal|Geeza/);
    }
  });
});

describe('preloading', () => {
  it('preloads only the chosen families, in the page\'s own script', () => {
    const hrefs = preloadFontsFor(['system-serif', 'system-sans'], 'arabic');

    expect(hrefs).toEqual(['/fonts/amiri-400-arabic.woff2', '/fonts/cairo-400-arabic.woff2']);
    for (const href of hrefs) {
      expect(existsSync(path.join(ROOT, 'public', href)), href).toBe(true);
    }
  });

  it('asks for the Latin subset on an English page', () => {
    expect(preloadFontsFor(['system-sans'], 'latin')).toEqual(['/fonts/cairo-400-latin.woff2']);
  });

  it('deduplicates when heading and body share a family', () => {
    expect(preloadFontsFor(['system-serif', 'arabic-naskh'], 'arabic')).toEqual([
      '/fonts/amiri-400-arabic.woff2',
    ]);
  });

  it('preloads nothing for a face that downloads nothing', () => {
    expect(preloadFontsFor(['system-mono'], 'latin')).toEqual([]);
  });

  it('ignores unknown keys rather than guessing a file', () => {
    expect(preloadFontsFor(['no-such-face', null, undefined], 'latin')).toEqual([]);
  });

  it('never preloads a file that is not on disk — every face, both scripts', () => {
    // The defect this replaced: the href was built from the family name and
    // the page's script without consulting the face's own `scripts` field, so
    // an Arabic page on a Latin-only family — Playfair Display, Inter — asked
    // for a subset that was never generated. Every Arabic luxury menu fired a
    // preload that 404ed and spent a connection on it.
    //
    // The earlier cases all happened to use Arabic-capable families, which is
    // why they passed. This one is exhaustive on purpose: any future face
    // whose subsets do not match its declaration fails here.
    for (const face of FONT_FACES) {
      for (const script of ['arabic', 'latin'] as const) {
        for (const href of preloadFontsFor([face.key], script)) {
          expect(
            existsSync(path.join(ROOT, 'public', href)),
            `${face.key} (${script}) preloads ${href}, which does not exist`,
          ).toBe(true);
        }
      }
    }
  });

  it('preloads nothing for a Latin-only family on an Arabic page', () => {
    expect(preloadFontsFor(['latin-editorial'], 'arabic')).toEqual([]);
    expect(preloadFontsFor(['latin-neutral'], 'arabic')).toEqual([]);

    // ...and still preloads them where they are actually drawn.
    expect(preloadFontsFor(['latin-editorial'], 'latin')).toEqual([
      '/fonts/playfair-display-400-latin.woff2',
    ]);
  });

  it('still preloads the Arabic-capable family beside a Latin-only one', () => {
    // A mixed pair must not lose the face the page genuinely needs.
    expect(preloadFontsFor(['latin-editorial', 'system-sans'], 'arabic')).toEqual([
      '/fonts/cairo-400-arabic.woff2',
    ]);
  });
});

describe('brand tokens resolve through the one catalogue', () => {
  const tokens = {
    colorPrimary: '#1B1F23',
    colorSecondary: '#3C4A52',
    colorAccent: '#A98F57',
    colorBackground: '#FFFFFF',
    colorSurface: '#F7F7F5',
    colorText: '#16181A',
    colorMuted: '#6B7176',
    colorBorder: '#E3E3E0',
    fontHeading: 'system-serif',
    fontBody: 'system-sans',
    radiusScale: 'md',
  };

  it('emits a real stack naming the shipped family, not a system-only fallback', () => {
    const style = brandTokensToStyle(tokens) as Record<string, string>;

    expect(style['--brand-font-heading']).toContain('Amiri');
    expect(style['--brand-font-body']).toContain('Cairo');
  });

  it('resolves the keys added alongside the webfonts', () => {
    const style = brandTokensToStyle({
      ...tokens,
      fontHeading: 'latin-editorial',
      fontBody: 'arabic-kufi',
    }) as Record<string, string>;

    expect(style['--brand-font-heading']).toContain('Playfair Display');
    expect(style['--brand-font-body']).toContain('Tajawal');
  });

  it('falls back to the body sans for a key nobody recognises', () => {
    const style = brandTokensToStyle({ ...tokens, fontHeading: 'nonsense' }) as Record<
      string,
      string
    >;

    expect(style['--brand-font-heading']).toBe(resolveFont('system-sans', 'system-sans').stack);
  });
});

describe('the demo businesses', () => {
  const seed = readFileSync(path.join(ROOT, 'prisma/seed.ts'), 'utf8');

  const chosen = (field: 'fontHeading' | 'fontBody') =>
    [...seed.matchAll(new RegExp(`${field}: '([\\w-]+)'`, 'g'))].map((m) => m[1]!);

  it('only picks faces the catalogue actually knows', () => {
    const keys = new Set(FONT_FACES.map((face) => face.key));
    for (const key of [...chosen('fontHeading'), ...chosen('fontBody')]) {
      expect(keys, key).toContain(key);
    }
  });

  it('never sets a heading-only face as body text', () => {
    for (const key of chosen('fontBody')) {
      expect(resolveFont(key, 'system-sans').roles, `${key} as body`).toContain('body');
    }
  });

  it('gives the demos genuinely different pairings', () => {
    // §174: six businesses that share one typeface are six skins, not six brands.
    const pairs = chosen('fontHeading').map((heading, index) => `${heading}/${chosen('fontBody')[index]}`);
    expect(new Set(pairs).size).toBeGreaterThanOrEqual(5);
  });
});
