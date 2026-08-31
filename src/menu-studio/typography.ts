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
 * The platform ships six webfont families, all under the SIL Open Font Licence
 * and all self-hosted (`public/fonts`, licence in `OFL.txt`). Every stack still
 * ends in a system fallback, so a face that fails to load degrades to real
 * letterforms rather than to tofu.
 *
 * The `system-*` keys are historical: they are stored in the database against
 * existing businesses, so they keep their names while their stacks now resolve
 * to shipped faces. Renaming them would silently repaint every menu.
 */

export type FontRole = 'heading' | 'body' | 'price' | 'accent';

export interface FontFace {
  key: string;
  label: string;
  /** CSS font-family stack, in order of preference. */
  stack: string;
  /**
   * The webfont family this face leads with, or `null` when it uses only faces
   * already on the reader's machine. Used to preload exactly the families a
   * page will actually draw with (§33).
   */
  family: string | null;
  /** Which scripts this stack renders properly. */
  scripts: readonly ('arabic' | 'latin')[];
  /** What the face is for, in a designer's terms. */
  character: 'serif' | 'sans' | 'display' | 'mono';
  roles: readonly FontRole[];
  description: string;
}

/**
 * Fallbacks behind every shipped face. A visitor whose connection drops mid-load
 * still gets Arabic letterforms rather than tofu.
 */
const ARABIC_FALLBACK = '"Noto Naskh Arabic", "Geeza Pro", "Segoe UI", Tahoma';

export const FONT_FACES: readonly FontFace[] = [
  {
    key: 'system-serif',
    family: 'Amiri',
    label: 'Naskh Serif',
    stack: `Amiri, "Playfair Display", ui-serif, Georgia, ${ARABIC_FALLBACK}, serif`,
    scripts: ['arabic', 'latin'],
    character: 'serif',
    roles: ['heading', 'body', 'accent'],
    description:
      'Classical naskh with a matched Latin serif. Editorial and unhurried; the face for a menu that wants to look older than it is.',
  },
  {
    key: 'system-sans',
    family: 'Cairo',
    label: 'Contemporary Sans',
    stack: `Cairo, Inter, ui-sans-serif, system-ui, ${ARABIC_FALLBACK}, sans-serif`,
    scripts: ['arabic', 'latin'],
    character: 'sans',
    roles: ['heading', 'body', 'price', 'accent'],
    description:
      'Modern Arabic sans, legible down to caption sizes. The safe choice for a long menu.',
  },
  {
    key: 'system-display',
    family: 'El Messiri',
    label: 'Display',
    stack: `"El Messiri", Cairo, ui-sans-serif, ${ARABIC_FALLBACK}, sans-serif`,
    // Upgraded from Latin-only: the shipped face covers Arabic properly, so a
    // bold heading no longer falls back mid-word.
    scripts: ['arabic', 'latin'],
    character: 'display',
    roles: ['heading', 'accent'],
    description:
      'Arabic display weight with real presence. Built for a headline, wrong for a paragraph.',
  },
  {
    key: 'system-mono',
    family: null,
    label: 'Tabular',
    stack: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
    scripts: ['latin'],
    character: 'mono',
    roles: ['price'],
    description:
      'Figures align in a column. The reason prices stop looking ragged. Uses the reader\'s own monospace face — no download.',
  },
  {
    key: 'arabic-naskh',
    family: 'Amiri',
    label: 'Amiri',
    stack: `Amiri, "Noto Naskh Arabic", "Traditional Arabic", ${ARABIC_FALLBACK}, serif`,
    scripts: ['arabic', 'latin'],
    character: 'serif',
    roles: ['heading', 'body', 'accent'],
    description: 'Classical Arabic letterforms with modern proportions.',
  },
  {
    key: 'arabic-kufi',
    family: 'Tajawal',
    label: 'Geometric',
    stack: `Tajawal, Cairo, "Noto Kufi Arabic", ${ARABIC_FALLBACK}, sans-serif`,
    scripts: ['arabic', 'latin'],
    character: 'display',
    roles: ['heading', 'body', 'accent'],
    description: 'Geometric Arabic. Contemporary, not antique — the minimal and modern themes lean on it.',
  },
  {
    key: 'latin-editorial',
    family: 'Playfair Display',
    label: 'Editorial Serif',
    stack: `"Playfair Display", Amiri, ui-serif, Georgia, ${ARABIC_FALLBACK}, serif`,
    scripts: ['latin'],
    character: 'serif',
    roles: ['heading', 'accent'],
    description:
      'High-contrast Latin serif for a masthead. Arabic falls back to Amiri, which is a real pairing rather than an accident.',
  },
  {
    key: 'latin-neutral',
    family: 'Inter',
    label: 'Neutral Sans',
    stack: `Inter, Cairo, ui-sans-serif, system-ui, ${ARABIC_FALLBACK}, sans-serif`,
    scripts: ['latin'],
    character: 'sans',
    roles: ['body', 'price', 'accent'],
    description: 'Neutral Latin sans with excellent figures. Pairs with Cairo for Arabic.',
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

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The files a page should preload, given the faces it will actually draw with
 * (§33).
 *
 * Only the *body* weight of each chosen family, and only the script the page is
 * being rendered in: an Arabic menu has no use for the Latin subset, and
 * preloading a face the page never draws is worse than not preloading at all —
 * it competes for bandwidth with the one it does need.
 *
 * Everything else still loads, lazily, from the `@font-face` rules in
 * `src/design/fonts.css`; this only decides what is worth fetching early.
 */
export function preloadFontsFor(
  keys: readonly (string | null | undefined)[],
  script: 'arabic' | 'latin',
): string[] {
  const families = new Set<string>();

  for (const key of keys) {
    const face = BY_KEY.get(key ?? '');
    if (face?.family) families.add(face.family);
  }

  return [...families]
    .map((family) => `/fonts/${family.toLowerCase().replace(/\s+/g, '-')}-400-${script}.woff2`)
    .sort();
}
