import { MENU_THEMES } from './catalogue';
import type { MenuTheme, MenuThemeLayout, ResolvedMenuTheme } from './types';

export * from './types';
export { MENU_THEMES } from './catalogue';

const BY_KEY = new Map(MENU_THEMES.map((theme) => [theme.key, theme]));

export const DEFAULT_THEME_KEY = 'modern-minimal';

export function getTheme(key: string | null | undefined): MenuTheme | undefined {
  return BY_KEY.get(key ?? '');
}

/**
 * Resolves a stored (themeKey, layoutKey) pair leniently.
 *
 * A menu whose theme was renamed or removed must still render: a restaurant's
 * published menu going blank because a design key moved is a worse failure
 * than showing it in the default theme.
 */
export function resolveTheme(themeKey: string | null, layoutKey: string | null): ResolvedMenuTheme {
  const theme = BY_KEY.get(themeKey ?? '') ?? BY_KEY.get(DEFAULT_THEME_KEY)!;
  const layout: MenuThemeLayout =
    theme.layouts.find((entry) => entry.key === layoutKey) ?? theme.layouts[0]!;

  return { theme, layout };
}

export function isKnownTheme(themeKey: string, layoutKey?: string): boolean {
  const theme = BY_KEY.get(themeKey);
  if (!theme) return false;

  return layoutKey === undefined || theme.layouts.some((layout) => layout.key === layoutKey);
}

export interface ThemeSuggestion {
  theme: MenuTheme;
  /** 0–1. How well the measured brand matches what this theme suits. */
  score: number;
  reason: string;
}

/**
 * Suggests themes for a measured brand (Menu Studio §9).
 *
 * Deterministic, and it explains itself: mood words come from the logo
 * analysis, tone from the logo's weighted luminance. The result is ranked, not
 * applied — the operator picks (§9: "Do NOT blindly apply AI output").
 */
export function suggestThemes(
  mood: readonly string[],
  tone: 'light' | 'dark',
  limit = 3,
): ThemeSuggestion[] {
  return MENU_THEMES.map((theme) => {
    const matched = theme.suits.filter((word) => mood.includes(word));
    const moodScore = theme.suits.length === 0 ? 0 : matched.length / theme.suits.length;

    const toneScore =
      theme.tonePreference === 'either' ? 0.5 : theme.tonePreference === tone ? 1 : 0;

    const score = moodScore * 0.6 + toneScore * 0.4;

    const reasons: string[] = [];
    if (matched.length > 0) reasons.push(`your logo reads ${matched.join(' and ')}`);
    if (theme.tonePreference === tone) reasons.push(`it is composed for a ${tone} page`);
    else if (theme.tonePreference === 'either') reasons.push('it works on either a light or dark page');

    return {
      theme,
      score,
      reason:
        reasons.length > 0
          ? `Suggested because ${reasons.join(', and ')}.`
          : 'Offered as a neutral option: nothing measured from the logo points to it in particular.',
    };
  })
    .sort((a, b) => b.score - a.score || a.theme.label.localeCompare(b.theme.label))
    .slice(0, limit);
}
