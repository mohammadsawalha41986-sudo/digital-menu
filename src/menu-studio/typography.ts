/**
 * Typography engine (Menu Studio §5, §35).
 *
 * Fonts are declared here as *roles* — heading, body, price, accent — because
 * that is how a menu is designed: the price column and the dish name are
 * different jobs, and a theme that only sets "the font" cannot express one.
 *
 * Two rules run through the whole file:
 *
 *  1. **Every face must cover Arabic or state that it does not.** Arabic is the
 *     primary authored language (GOALS I3). A recommendation that renders a
 *     restaurant's Arabic dish names in tofu is not a recommendation.
 *  2. **Nothing is chosen at random.** The recommender reads measured brand
 *     properties and states its reason, and every suggestion is editable
 *     (§35). Randomised typography is how a platform makes every menu look
 *     like an accident.
 *
 * Stacks resolve to fonts already installed or to the system UI faces; the
 * platform ships no webfont it has no licence for.
 */

export type FontRole = 'heading' | 'body' | 'price' | 'accent';

export interface FontFace {
  key: string;
  label: string;
  /** CSS font-family stack, in order of preference. */
  stack: string;
  /** Which scripts this stack renders properly. */
  scripts: readonly ('arabic' | 'latin')[];
  /** What the face is for, in a designer's terms. */
  character: 'serif' | 'sans' | 'display' | 'mono';
  roles: readonly FontRole[];
  description: string;
}

const SYSTEM_ARABIC = '"Noto Naskh Arabic", "Geeza Pro", "Segoe UI", Tahoma';

export const FONT_FACES: readonly FontFace[] = [
  {
    key: 'system-serif',
    label: 'Serif',
    stack: `ui-serif, Georgia, "Times New Roman", ${SYSTEM_ARABIC}, serif`,
    scripts: ['arabic', 'latin'],
    character: 'serif',
    roles: ['heading', 'body', 'accent'],
    description: 'Editorial default. Reads as considered rather than corporate.',
  },
  {
    key: 'system-sans',
    label: 'Sans',
    stack: `ui-sans-serif, system-ui, "Segoe UI", ${SYSTEM_ARABIC}, sans-serif`,
    scripts: ['arabic', 'latin'],
    character: 'sans',
    roles: ['heading', 'body', 'price', 'accent'],
    description: 'Neutral and legible at small sizes. Safe for long menus.',
  },
  {
    key: 'system-display',
    label: 'Display',
    stack: `"Helvetica Neue", Impact, ui-sans-serif, ${SYSTEM_ARABIC}, sans-serif`,
    scripts: ['latin'],
    character: 'display',
    roles: ['heading', 'accent'],
    description: 'Headline weight for bold compositions. Latin only — Arabic falls back.',
  },
  {
    key: 'system-mono',
    label: 'Tabular',
    stack: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
    scripts: ['latin'],
    character: 'mono',
    roles: ['price'],
    description: 'Figures align in a column. The reason prices stop looking ragged.',
  },
  {
    key: 'arabic-naskh',
    label: 'Naskh',
    stack: `"Noto Naskh Arabic", "Amiri", "Traditional Arabic", ${SYSTEM_ARABIC}, serif`,
    scripts: ['arabic', 'latin'],
    character: 'serif',
    roles: ['heading', 'body', 'accent'],
    description: 'Classical Arabic letterforms with modern proportions.',
  },
  {
    key: 'arabic-kufi',
    label: 'Kufi',
    stack: `"Noto Kufi Arabic", "Segoe UI", ${SYSTEM_ARABIC}, sans-serif`,
    scripts: ['arabic', 'latin'],
    character: 'display',
    roles: ['heading', 'accent'],
    description: 'Geometric Arabic display. Contemporary, not antique.',
  },
];

const BY_KEY = new Map(FONT_FACES.map((face) => [face.key, face]));

export function resolveFont(key: string | null | undefined, fallback: string): FontFace {
  return BY_KEY.get(key ?? '') ?? BY_KEY.get(fallback) ?? FONT_FACES[0]!;
}

export function fontsForRole(role: FontRole): FontFace[] {
  return FONT_FACES.filter((face) => face.roles.includes(role));
}

export interface TypographyChoice {
  heading: string;
  body: string;
  price: string;
  accent: string;
  /** Why these, in words an operator can argue with. */
  reason: string;
}

/**
 * Recommends a type pairing from measured brand properties.
 *
 * Deterministic and inspectable: mood words come from hue and saturation
 * measurements, and each branch states its reasoning. When an AI engine is
 * configured it can replace this function behind the same signature — the
 * studio treats the result as a suggestion either way (§9, §37).
 */
export function recommendTypography(mood: readonly string[], tone: 'light' | 'dark'): TypographyChoice {
  const has = (word: string) => mood.includes(word);

  if (has('premium') || tone === 'dark') {
    return {
      heading: 'arabic-naskh',
      body: 'system-serif',
      price: 'system-serif',
      accent: 'system-serif',
      reason:
        'The logo reads dark and premium, so the pairing stays in serif throughout: a display face would fight the restraint.',
    };
  }

  if (has('bold') || has('playful')) {
    return {
      heading: 'arabic-kufi',
      body: 'system-sans',
      price: 'system-mono',
      accent: 'arabic-kufi',
      reason:
        'High-saturation marks carry a geometric display heading. Prices move to tabular figures so a loud page still scans.',
    };
  }

  if (has('minimal')) {
    return {
      heading: 'system-sans',
      body: 'system-sans',
      price: 'system-mono',
      accent: 'system-sans',
      reason: 'A low-chroma mark wants one voice: a single sans across the page, with figures set tabular.',
    };
  }

  return {
    heading: 'system-serif',
    body: 'system-sans',
    price: 'system-sans',
    accent: 'system-serif',
    reason: 'Serif headings against a sans body — the default editorial pairing, legible at menu sizes in both scripts.',
  };
}

/** Faces that cannot render Arabic, so the studio can warn before applying. */
export function latinOnlyRoles(choice: TypographyChoice): FontRole[] {
  const roles: FontRole[] = [];
  const check: [FontRole, string][] = [
    ['heading', choice.heading],
    ['body', choice.body],
    ['price', choice.price],
    ['accent', choice.accent],
  ];

  for (const [role, key] of check) {
    const face = BY_KEY.get(key);
    if (face && !face.scripts.includes('arabic')) roles.push(role);
  }

  return roles;
}
