import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { brandTokensToStyle } from '@/design/brand';

/**
 * Every `--brand-*` a template asks for must be one the brand layer emits.
 *
 * This exists because it did not. Ten template families between them made 125
 * references to `--brand-accent`, `--brand-text`, `--brand-muted` and friends,
 * while the brand layer has always emitted `--brand-color-accent`,
 * `--brand-color-text`, `--brand-color-muted`. CSS custom properties fail
 * silently: an unknown one is not an error, it is "invalid at computed-value
 * time", so the declaration is simply dropped and the element inherits. The
 * result was offer heroes, hours tables and badges rendering in inherited
 * near-black across every family, on every profile, with nothing anywhere
 * reporting a problem.
 *
 * A typo in a custom property name is invisible to the type checker, to the
 * linter and to the build. This test is the only thing that can see it.
 */

const TEMPLATES_DIR = path.resolve(__dirname, '../../src/templates');

/** The tokens a profile root actually carries at runtime. */
function emittedTokens(): Set<string> {
  const style = brandTokensToStyle({
    colorPrimary: '#101010',
    colorSecondary: '#202020',
    colorAccent: '#303030',
    colorBackground: '#f0f0f0',
    colorSurface: '#ffffff',
    colorText: '#111111',
    colorMuted: '#666666',
    colorBorder: '#dddddd',
    fontHeading: 'system-sans',
    fontBody: 'system-sans',
    radiusScale: 'md',
    // Emitted only when the owner sets them; set here so they count as known.
    menuPage: '#101010',
    menuCard: '#202020',
    menuPrice: '#303030',
  });

  return new Set(Object.keys(style).filter((key) => key.startsWith('--brand-')));
}

function templateStylesheets(): { file: string; css: string }[] {
  // Recursive: the menu design keeps its stylesheet a level down
  // (`street-food/sabah/sabah.css`).
  return readdirSync(TEMPLATES_DIR, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.css'))
    .map((entry) => ({
      file: entry.split(path.sep).join('/'),
      css: readFileSync(path.join(TEMPLATES_DIR, entry), 'utf8'),
    }));
}

describe('brand custom properties', () => {
  const emitted = emittedTokens();
  const sheets = templateStylesheets();

  it('finds the menu design stylesheet', () => {
    expect(sheets.map((sheet) => sheet.file)).toContain('street-food/sabah/sabah.css');
  });

  it('emits every token name the templates reference', () => {
    const unknown: string[] = [];

    for (const sheet of sheets) {
      // `var(--brand-x)` and `var(--brand-x, fallback)` alike.
      for (const match of sheet.css.matchAll(/var\(\s*(--brand-[a-z0-9-]+)/g)) {
        const token = match[1];
        if (token && !emitted.has(token)) unknown.push(`${sheet.file}: ${token}`);
      }
    }

    expect(unknown).toEqual([]);
  });

  it('reads the brand colours and fonts, so the check has teeth', () => {
    const css = sheets.map((sheet) => sheet.css).join('\n');

    for (const token of [
      '--brand-color-primary',
      '--brand-color-accent',
      '--brand-font-heading',
      '--brand-font-body',
    ]) {
      expect(css, token).toMatch(new RegExp(`var\\(\\s*${token}\\b`));
    }
  });
});
