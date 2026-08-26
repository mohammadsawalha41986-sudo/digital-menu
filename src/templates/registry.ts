import { EditorialTemplate } from './editorial/EditorialTemplate';
import type { ResolvedTemplate, TemplateDefinition } from './types';

/**
 * Template catalogue.
 *
 * Templates are code, not database rows: each one is a React component plus a
 * stylesheet, so a row could never describe it faithfully. A business stores
 * only `templateKey` + `variantKey`, which are validated against this registry
 * on write (admin) and resolved leniently on read (public).
 *
 * Adding a family is: write the component, add an entry here. Nothing else in
 * the application changes — that is the extensibility the spec asks for (§24).
 */

const EDITORIAL: TemplateDefinition = {
  key: 'editorial',
  label: 'Editorial',
  description:
    'Type-led composition with generous whitespace, rule-separated sections and restrained motion.',
  variants: [
    {
      key: 'a',
      label: 'Editorial A',
      description: 'Left-aligned masthead, single-column menu index.',
    },
  ],
  render: EditorialTemplate,
};

const TEMPLATES: readonly TemplateDefinition[] = [EDITORIAL];

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
 * code. The substitution is reported so it can be surfaced in admin.
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
