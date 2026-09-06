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
  });

  return new Set(Object.keys(style).filter((key) => key.startsWith('--brand-')));
}

function templateStylesheets(): { file: string; css: string }[] {
  const sheets: { file: string; css: string }[] = [];

  for (const family of readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
    if (!family.isDirectory()) continue;

    const dir = path.join(TEMPLATES_DIR, family.name);

    for (const entry of readdirSync(dir)) {
      if (entry.endsWith('.css')) {
        sheets.push({
          file: `${family.name}/${entry}`,
          css: readFileSync(path.join(dir, entry), 'utf8'),
        });
      }
    }
  }

  return sheets;
}

describe('brand custom properties', () => {
  const emitted = emittedTokens();
  const sheets = templateStylesheets();

  it('finds the template stylesheets', () => {
    expect(sheets.length).toBeGreaterThanOrEqual(10);
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

  it('references at least one brand token per family, so the check has teeth', () => {
    const families = new Set(
      sheets.filter((s) => /var\(\s*--brand-/.test(s.css)).map((s) => s.file.split('/')[0]),
    );

    expect(families.size).toBeGreaterThanOrEqual(10);
  });
});
