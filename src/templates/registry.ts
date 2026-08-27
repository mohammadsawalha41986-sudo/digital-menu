import { EditorialTemplate } from './editorial/EditorialTemplate';
import { LuxuryTemplate } from './luxury/LuxuryTemplate';
import { MinimalTemplate } from './minimal/MinimalTemplate';
import { ModernTemplate } from './modern/ModernTemplate';
import { BoldTemplate } from './bold/BoldTemplate';
import { DarkTemplate } from './dark/DarkTemplate';
import { HospitalityTemplate } from './hospitality/HospitalityTemplate';
import { CafeTemplate } from './cafe/CafeTemplate';
import { CasualTemplate } from './casual/CasualTemplate';
import { PremiumTemplate } from './premium/PremiumTemplate';
import type { ResolvedTemplate, TemplateDefinition } from './types';

/**
 * Template catalogue (master spec §22, §24).
 *
 * Templates are code, not database rows: each is a React component plus a
 * stylesheet, which no row could describe faithfully. A business stores only
 * `templateKey` + `variantKey`, validated against this registry on write and
 * resolved leniently on read.
 *
 * The ten families differ in *composition*, not palette — recolouring is not a
 * new template (§23). Each entry's `description` states what structurally
 * distinguishes it, which is also the answer to "why is this not just the
 * previous one with different colours".
 *
 * Variants are layout choices *within* a family, applied as a `data-variant`
 * attribute the family's stylesheet reads. A variant may change density,
 * column count or image ratio; if it needs different markup, it is a new
 * family instead.
 */

const EDITORIAL: TemplateDefinition = {
  key: 'editorial',
  label: 'Editorial',
  description:
    'Type-led masthead, sticky category index, rule-separated item rows with the price set as a tabular figure. No cards anywhere.',
  variants: [
    { key: 'a', label: 'Editorial A', description: 'Single column, generous leading.' },
    { key: 'b', label: 'Editorial B', description: 'Two-column item list from tablet up.' },
    { key: 'c', label: 'Editorial C', description: 'Condensed rhythm for long menus.' },
  ],
  render: EditorialTemplate,
};

const LUXURY: TemplateDefinition = {
  key: 'luxury',
  label: 'Luxury',
  description:
    'Centred ceremonial masthead, no category navigation, items as centred stanzas, at most one photograph per category. Slow fades.',
  variants: [
    { key: 'a', label: 'Luxury A', description: 'Wide tracking, uppercase headings.' },
    { key: 'b', label: 'Luxury B', description: 'Softer case, larger measure.' },
  ],
  render: LuxuryTemplate,
};

const MINIMAL: TemplateDefinition = {
  key: 'minimal',
  label: 'Minimal',
  description:
    'Text only — renders no photography at all. One line per item with the price at the inline end. No navigation, no motion.',
  variants: [
    { key: 'a', label: 'Minimal A', description: 'Standard measure.' },
    { key: 'b', label: 'Minimal B', description: 'Narrow measure, printed-card proportions.' },
  ],
  render: MinimalTemplate,
};

const MODERN: TemplateDefinition = {
  key: 'modern',
  label: 'Modern',
  description:
    'Sticky identity bar, pill category chips, horizontal rows with a square thumbnail, and a fixed contact dock on phones.',
  variants: [
    { key: 'a', label: 'Modern A', description: 'Single-column rows.' },
    { key: 'b', label: 'Modern B', description: 'Two-column rows from tablet up.' },
    { key: 'c', label: 'Modern C', description: 'Larger thumbnails, looser rows.' },
  ],
  render: ModernTemplate,
};

const BOLD: TemplateDefinition = {
  key: 'bold',
  label: 'Bold',
  description:
    'Full-bleed bands, oversized condensed headings, slab category titles, and price set as large as the item name.',
  variants: [
    { key: 'a', label: 'Bold A', description: 'Full-width bands.' },
    { key: 'b', label: 'Bold B', description: 'Two-up bands on wide screens.' },
  ],
  render: BoldTemplate,
};

const DARK: TemplateDefinition = {
  key: 'dark',
  label: 'Dark',
  description:
    'Image mosaic on a ground derived from the brand’s own text colour, captions over a scrim, featured items spanning two columns.',
  variants: [
    { key: 'a', label: 'Dark A', description: 'Portrait tiles, two columns.' },
    { key: 'b', label: 'Dark B', description: 'Square tiles, three columns on desktop.' },
  ],
  render: DarkTemplate,
};

const HOSPITALITY: TemplateDefinition = {
  key: 'hospitality',
  label: 'Hospitality',
  description:
    'Service catalogue: address and hours above the list, collapsible service groups, duration beside price, a booking action after every group.',
  variants: [
    { key: 'a', label: 'Hospitality A', description: 'Groups open by default.' },
    { key: 'b', label: 'Hospitality B', description: 'Compact rows for long service lists.' },
  ],
  render: HospitalityTemplate,
};

const CAFE: TemplateDefinition = {
  key: 'cafe',
  label: 'Café',
  description:
    'Compact square tiles in a two-up grid, underlined category tabs, size and price stacked. Light lift on press.',
  variants: [
    { key: 'a', label: 'Café A', description: 'Two columns on phones, four on desktop.' },
    { key: 'b', label: 'Café B', description: 'Three columns, smaller tiles.' },
  ],
  render: CafeTemplate,
};

const CASUAL: TemplateDefinition = {
  key: 'casual',
  label: 'Casual',
  description:
    'Opens with large category picture tiles, then generous photo-left rows with big type. Nothing sticky, nothing to learn.',
  variants: [
    { key: 'a', label: 'Casual A', description: 'Four-up category tiles.' },
    { key: 'b', label: 'Casual B', description: 'Two-up tiles, larger photography.' },
  ],
  render: CasualTemplate,
};

const PREMIUM: TemplateDefinition = {
  key: 'premium',
  label: 'Premium',
  description:
    'Magazine spread per category: one item at feature size with a standfirst and caption, the rest as a quiet two-column index.',
  variants: [
    { key: 'a', label: 'Premium A', description: 'Portrait feature image.' },
    { key: 'b', label: 'Premium B', description: 'Landscape feature, wider index.' },
  ],
  render: PremiumTemplate,
};

const TEMPLATES: readonly TemplateDefinition[] = [
  EDITORIAL,
  LUXURY,
  MINIMAL,
  MODERN,
  BOLD,
  DARK,
  HOSPITALITY,
  CAFE,
  CASUAL,
  PREMIUM,
];

export const DEFAULT_TEMPLATE_KEY = EDITORIAL.key;
export const DEFAULT_VARIANT_KEY = 'a';

export function listTemplates(): readonly TemplateDefinition[] {
  return TEMPLATES;
}

export function findTemplate(key: string): TemplateDefinition | undefined {
  return TEMPLATES.find((template) => template.key === key);
}

/** Validation used by admin writes — an unknown key must be rejected there. */
export function isValidTemplateSelection(templateKey: string, variantKey: string): boolean {
  const template = findTemplate(templateKey);
  return Boolean(template?.variants.some((variant) => variant.key === variantKey));
}

/**
 * Public-render resolution. Deliberately lenient: a business whose stored
 * template key no longer exists (a family renamed or withdrawn) must still
 * render something branded rather than 500 on a visitor who just scanned a QR
 * code. The substitution is reported so admin can surface it.
 */
export function resolveTemplate(templateKey: string, variantKey: string): ResolvedTemplate {
  const definition = findTemplate(templateKey) ?? (TEMPLATES[0] as TemplateDefinition);
  const usedTemplateFallback = definition.key !== templateKey;

  const variant =
    definition.variants.find((candidate) => candidate.key === variantKey) ??
    (definition.variants[0] as ResolvedTemplate['variant']);

  return {
    definition,
    variant,
    usedFallback: usedTemplateFallback || variant.key !== variantKey,
  };
}

/**
 * Business types the spec associates with each family (§16). Used to order the
 * admin picker sensibly; it is a suggestion, never a restriction — any
 * business may use any template.
 */
export const SUGGESTED_TEMPLATES: Record<string, readonly string[]> = {
  RESTAURANT: ['editorial', 'premium', 'bold', 'casual', 'dark'],
  CAFE: ['cafe', 'editorial', 'minimal', 'modern'],
  BAKERY: ['casual', 'cafe', 'editorial', 'premium'],
  DESSERT: ['cafe', 'casual', 'bold'],
  SALON: ['hospitality', 'luxury', 'minimal'],
  BEAUTY_CENTER: ['hospitality', 'luxury', 'premium'],
  SPA: ['luxury', 'hospitality', 'minimal'],
  BARBER: ['hospitality', 'bold', 'modern'],
  GYM: ['bold', 'modern', 'hospitality'],
  HOTEL: ['hospitality', 'luxury', 'premium'],
  RETAIL: ['modern', 'minimal', 'premium'],
  OTHER: ['editorial', 'minimal', 'modern'],
};
