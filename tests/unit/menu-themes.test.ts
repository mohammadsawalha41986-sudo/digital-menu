import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_KEY,
  MENU_THEMES,
  isKnownTheme,
  resolveTheme,
  suggestThemes,
} from '@/menu-studio/themes';
import { recommendTypography, latinOnlyRoles, resolveFont, FONT_FACES } from '@/menu-studio/typography';

describe('the theme catalogue', () => {
  it('offers at least the eight demo themes the studio promises', () => {
    expect(MENU_THEMES.length).toBeGreaterThanOrEqual(8);
  });

  it('has no duplicate keys or labels', () => {
    expect(new Set(MENU_THEMES.map((t) => t.key)).size).toBe(MENU_THEMES.length);
    expect(new Set(MENU_THEMES.map((t) => t.label)).size).toBe(MENU_THEMES.length);
  });

  it('gives every theme a layout and every layout a distinct key', () => {
    for (const theme of MENU_THEMES) {
      expect(theme.layouts.length).toBeGreaterThan(0);
      expect(new Set(theme.layouts.map((l) => l.key)).size).toBe(theme.layouts.length);
    }
  });

  it('names only fonts that exist', () => {
    const keys = new Set(FONT_FACES.map((face) => face.key));

    for (const theme of MENU_THEMES) {
      for (const role of ['heading', 'body', 'price', 'accent'] as const) {
        expect(keys.has(theme.typography[role])).toBe(true);
      }
    }
  });

  it('makes themes structurally distinct, not recolourings of each other', () => {
    // The signature a visitor actually perceives: how categories announce
    // themselves, how items are set, where the price sits, whether photography
    // leads. Two themes sharing all of it would be one theme listed twice.
    const signatures = MENU_THEMES.map((theme) =>
      [
        theme.categoryStyle,
        theme.priceStyle,
        theme.layouts[0]!.itemStyle,
        theme.layouts[0]!.imageStyle,
        theme.density,
      ].join('|'),
    );

    expect(new Set(signatures).size).toBe(MENU_THEMES.length);
  });

  it('carries no colours: a theme cannot overrule a restaurant’s brand', () => {
    const serialised = JSON.stringify(MENU_THEMES);
    expect(serialised).not.toMatch(/#[0-9a-f]{6}/i);
    expect(serialised).not.toMatch(/\brgb\(/i);
  });
});

describe('resolving a stored design', () => {
  it('falls back to the default rather than rendering nothing', () => {
    const { theme, layout } = resolveTheme('a-theme-that-was-removed', 'z');

    expect(theme.key).toBe(DEFAULT_THEME_KEY);
    expect(layout).toBe(theme.layouts[0]);
  });

  it('keeps a valid pair intact', () => {
    const { theme, layout } = resolveTheme('dark-luxury', 'b');
    expect(theme.key).toBe('dark-luxury');
    expect(layout.key).toBe('b');
  });

  it('validates keys for writes', () => {
    expect(isKnownTheme('dark-luxury', 'a')).toBe(true);
    expect(isKnownTheme('dark-luxury', 'q')).toBe(false);
    expect(isKnownTheme('nope')).toBe(false);
  });
});

describe('suggestions', () => {
  it('prefers a dark theme for a dark, premium brand and explains why', () => {
    const [first] = suggestThemes(['premium', 'cool'], 'dark');

    expect(first!.theme.tonePreference).toBe('dark');
    expect(first!.reason).toMatch(/premium|dark page/);
  });

  it('prefers an energetic theme for a bold, playful brand', () => {
    const suggestions = suggestThemes(['bold', 'playful'], 'light');
    expect(suggestions.map((s) => s.theme.key)).toContain('fast-casual');
  });

  it('still returns options, honestly labelled, when nothing was measured', () => {
    const suggestions = suggestThemes([], 'light');

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => /neutral option|light page/.test(s.reason))).toBe(true);
  });
});

describe('typography recommendations', () => {
  it('is deterministic for the same brand', () => {
    expect(recommendTypography(['bold'], 'light')).toEqual(recommendTypography(['bold'], 'light'));
  });

  it('always states its reasoning', () => {
    for (const mood of [['premium'], ['bold'], ['minimal'], []]) {
      expect(recommendTypography(mood, 'light').reason.length).toBeGreaterThan(20);
    }
  });

  it('flags a pairing that cannot render Arabic instead of shipping tofu', () => {
    const bold = recommendTypography(['bold'], 'light');
    expect(latinOnlyRoles(bold)).toContain('price');

    const premium = recommendTypography(['premium'], 'dark');
    expect(latinOnlyRoles(premium)).toEqual([]);
  });

  it('resolves an unknown font key to a real stack', () => {
    expect(resolveFont('not-a-font', 'system-sans').key).toBe('system-sans');
  });
});
