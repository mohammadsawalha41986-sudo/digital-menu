import { StreetFoodTemplate } from './street-food/StreetFoodTemplate';
import type { ResolvedTemplate, TemplateDefinition } from './types';

/**
 * Template catalogue (master spec §22, §24).
 *
 * The platform ships one menu design. Every restaurant renders it; what an
 * owner changes is the brand (colours derived from the logo, fonts) and how
 * dish photos are laid out. A business still stores `templateKey` +
 * `variantKey` so a future design can be added without a schema change, but
 * today the variant *is* the photo layout.
 *
 * Earlier families (editorial, luxury, minimal, modern, bold, dark,
 * hospitality, cafe, casual, premium) were withdrawn. A business row that still
 * names one resolves leniently to this design — a QR code already printed on a
 * table never breaks.
 */

const STREET_FOOD: TemplateDefinition = {
  key: 'street-food',
  label: 'Restaurant menu',
  description:
    'Photo-led hero slides, a category chip rail, search and filters, an item sheet, a cart that hands the order to WhatsApp, location and QR.',
  variants: [
    { key: 'a', label: 'Photo cards', description: 'Dishes as photo cards in a 2-4 column grid.' },
    { key: 'b', label: 'List', description: 'Compact rows with a small photo — best for long menus.' },
    { key: 'c', label: 'Large photos', description: 'One or two big photographs per row — best when the food photography is strong.' },
  ],
  render: StreetFoodTemplate,
};

const TEMPLATES: readonly TemplateDefinition[] = [STREET_FOOD];

export const DEFAULT_TEMPLATE_KEY = STREET_FOOD.key;
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
 * template key no longer exists (a withdrawn family) must still render
 * something branded rather than 500 on a visitor who just scanned a QR code.
 * The substitution is reported so admin can surface it.
 */
export function resolveTemplate(templateKey: string, variantKey: string): ResolvedTemplate {
  const definition = findTemplate(templateKey) ?? STREET_FOOD;
  const usedTemplateFallback = definition.key !== templateKey;

  // A withdrawn family's variant letter means nothing here, so it starts on
  // the default layout rather than inheriting an unrelated choice.
  const variant =
    (usedTemplateFallback ? undefined : definition.variants.find((candidate) => candidate.key === variantKey)) ??
    (definition.variants[0] as ResolvedTemplate['variant']);

  return {
    definition,
    variant,
    usedFallback: usedTemplateFallback || variant.key !== variantKey,
  };
}
