import type { ReactNode } from 'react';
import type { Dictionary } from '@/i18n/dictionary';
import type { Direction, Locale } from '@/i18n/config';
import type { PublicProfile } from '@/server/profile/types';

/**
 * Template contract — the *structure* half of template/theme separation
 * (master spec §22–§26; GOALS I6).
 *
 * A template owns composition: what the header is, how the hero reads, how
 * categories are presented, how an item detail opens, what the motion
 * personality is. It owns none of the colours — those arrive as
 * `--brand-*` custom properties on an ancestor element.
 *
 * A template therefore receives content and locale, and nothing else. If a
 * template ever needs a business's colour as a value rather than as a CSS
 * variable, that is a signal the separation is being violated.
 */

export interface TemplateRenderProps {
  profile: PublicProfile;
  locale: Locale;
  direction: Direction;
  dictionary: Dictionary;
}

export type TemplateComponent = (props: TemplateRenderProps) => ReactNode;

export interface TemplateVariant {
  key: string;
  /** Staff-facing label, e.g. "Editorial A". */
  label: string;
  description: string;
}

export interface TemplateDefinition {
  key: string;
  /** Staff-facing family name, e.g. "Editorial". */
  label: string;
  description: string;
  variants: readonly TemplateVariant[];
  render: TemplateComponent;
}

export interface ResolvedTemplate {
  definition: TemplateDefinition;
  variant: TemplateVariant;
  /** True when the stored key was unknown and the default was substituted. */
  usedFallback: boolean;
}
