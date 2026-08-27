import { prisma } from '@/server/db/client';
import { getStorage } from '@/server/storage';
import { requireTenantContext, type AuthenticatedUser } from '@/server/tenancy/context';
import { recordAudit } from '@/server/audit/log';
import { fromHex } from './color';
import { deriveIdentityFromLogo, repaletteFrom, type BrandIdentity, type Tone } from './identity';
import { recommendTypography } from '@/menu-studio/typography';
import { suggestThemes } from '@/menu-studio/themes';

/**
 * Brand identity as a stored, editable artefact (Menu Studio §6–§9, §31, §36).
 *
 * Analysis and application are two separate acts. Analysing a logo writes a
 * preset the operator can look at, argue with and edit; nothing about the live
 * menu changes until they apply it. That ordering is the whole point of §9's
 * "do NOT blindly apply" — a measurement offered is not a decision taken.
 */

export interface BrandPresetView {
  id: string;
  key: string;
  label: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
  };
  fonts: { heading: string; body: string; price: string; accent: string };
  extractedColors: string[];
  tone: Tone;
  mood: string[];
  recommendedThemeKey: string | null;
  manualOverrides: string[];
  fromLogo: boolean;
  logoMediaId: string | null;
}

function toView(row: {
  id: string;
  key: string;
  label: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  colorBackground: string;
  colorSurface: string;
  colorText: string;
  colorMuted: string;
  colorBorder: string;
  fontHeading: string;
  fontBody: string;
  fontPrice: string;
  fontAccent: string;
  extractedColors: string[];
  tone: string;
  mood: string[];
  recommendedThemeKey: string | null;
  manualOverrides: string[];
  fromLogo: boolean;
  logoMediaId: string | null;
}): BrandPresetView {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    palette: {
      primary: row.colorPrimary,
      secondary: row.colorSecondary,
      accent: row.colorAccent,
      background: row.colorBackground,
      surface: row.colorSurface,
      text: row.colorText,
      muted: row.colorMuted,
      border: row.colorBorder,
    },
    fonts: {
      heading: row.fontHeading,
      body: row.fontBody,
      price: row.fontPrice,
      accent: row.fontAccent,
    },
    extractedColors: row.extractedColors,
    tone: row.tone === 'dark' ? 'dark' : 'light',
    mood: row.mood,
    recommendedThemeKey: row.recommendedThemeKey,
    manualOverrides: row.manualOverrides,
    fromLogo: row.fromLogo,
    logoMediaId: row.logoMediaId,
  };
}

export interface AnalysisResult {
  preset: BrandPresetView;
  identity: BrandIdentity;
  typographyReason: string;
  suggestions: { key: string; label: string; reason: string }[];
}

/**
 * Reads a logo already in the media library and derives an identity from it.
 *
 * The media row is fetched through the tenant scope, so a media id belonging
 * to another business resolves to nothing rather than to somebody else's logo
 * (§32: identities never mix between clients).
 */
export async function analyseLogo(
  user: AuthenticatedUser,
  businessId: string,
  mediaId: string,
  key = 'default',
): Promise<AnalysisResult> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const media = await prisma.media.findFirst({
    where: { id: mediaId, businessId: context.businessId },
    select: { id: true, storageKey: true },
  });

  if (!media) {
    throw new Error('That image is not in this business’s media library.');
  }

  const bytes = await getStorage().get(media.storageKey);
  if (!bytes) {
    throw new Error('The stored image could not be read.');
  }

  const identity = await deriveIdentityFromLogo(new Uint8Array(bytes));
  const typography = recommendTypography(identity.mood, identity.tone);
  const suggestions = suggestThemes(identity.mood, identity.tone);

  const data = {
    label: 'Brand identity',
    logoMediaId: media.id,
    extractedColors: identity.extracted,
    colorPrimary: identity.palette.primary,
    colorSecondary: identity.palette.secondary,
    colorAccent: identity.palette.accent,
    colorBackground: identity.palette.background,
    colorSurface: identity.palette.surface,
    colorText: identity.palette.text,
    colorMuted: identity.palette.muted,
    colorBorder: identity.palette.border,
    fontHeading: typography.heading,
    fontBody: typography.body,
    fontPrice: typography.price,
    fontAccent: typography.accent,
    tone: identity.tone,
    mood: identity.mood,
    recommendedThemeKey: suggestions[0]?.theme.key ?? null,
    // A fresh analysis supersedes previous hand edits, and says so by clearing
    // the list rather than quietly keeping stale provenance.
    manualOverrides: [],
    fromLogo: identity.fromLogo,
  };

  const preset = await prisma.brandPreset.upsert({
    where: { businessId_key: { businessId: context.businessId, key } },
    update: data,
    create: { businessId: context.businessId, key, ...data },
  });

  await recordAudit({
    action: 'brand.analysed',
    entity: 'brand_preset',
    entityId: preset.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { fromLogo: identity.fromLogo, tone: identity.tone, mood: identity.mood },
  });

  return {
    preset: toView(preset),
    identity,
    typographyReason: typography.reason,
    suggestions: suggestions.map((entry) => ({
      key: entry.theme.key,
      label: entry.theme.label,
      reason: entry.reason,
    })),
  };
}

export async function getBrandPreset(
  user: AuthenticatedUser,
  businessId: string,
  key = 'default',
): Promise<BrandPresetView | null> {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const preset = await prisma.brandPreset.findFirst({
    where: { businessId: context.businessId, key },
  });

  return preset ? toView(preset) : null;
}

export interface OverrideInput {
  primary?: string;
  secondary?: string;
  accent?: string;
  tone?: Tone;
  fontHeading?: string;
  fontBody?: string;
  fontPrice?: string;
  fontAccent?: string;
}

/**
 * Applies an operator's edits (§8: "Allow the user to manually override").
 *
 * Changing a brand colour re-derives the supporting colours around it, so the
 * palette stays readable after a hand edit — the same contrast guarantee the
 * extraction gives. Which fields were touched is recorded, because a colour
 * nobody can trace is a colour nobody trusts.
 */
export async function overrideBrandPreset(
  user: AuthenticatedUser,
  businessId: string,
  input: OverrideInput,
  key = 'default',
): Promise<BrandPresetView> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const existing = await prisma.brandPreset.findFirst({
    where: { businessId: context.businessId, key },
  });

  if (!existing) throw new Error('Analyse a logo before editing the brand identity.');

  for (const [field, value] of Object.entries(input)) {
    if (field.startsWith('color') || ['primary', 'secondary', 'accent'].includes(field)) {
      if (typeof value === 'string' && !fromHex(value)) {
        throw new Error(`${field} must be a colour like #1F2421.`);
      }
    }
  }

  const primary = input.primary ?? existing.colorPrimary;
  const secondary = input.secondary ?? existing.colorSecondary;
  const accent = input.accent ?? existing.colorAccent;
  const tone: Tone = input.tone ?? (existing.tone === 'dark' ? 'dark' : 'light');

  const palette = repaletteFrom(primary, secondary, accent, tone);
  if (!palette) throw new Error('Those colours could not be read.');

  const touched = new Set(existing.manualOverrides);
  for (const field of Object.keys(input)) touched.add(field);

  const preset = await prisma.brandPreset.update({
    where: { id: existing.id },
    data: {
      colorPrimary: palette.primary,
      colorSecondary: palette.secondary,
      colorAccent: palette.accent,
      colorBackground: palette.background,
      colorSurface: palette.surface,
      colorText: palette.text,
      colorMuted: palette.muted,
      colorBorder: palette.border,
      tone,
      fontHeading: input.fontHeading ?? existing.fontHeading,
      fontBody: input.fontBody ?? existing.fontBody,
      fontPrice: input.fontPrice ?? existing.fontPrice,
      fontAccent: input.fontAccent ?? existing.fontAccent,
      manualOverrides: [...touched],
    },
  });

  await recordAudit({
    action: 'brand.overridden',
    entity: 'brand_preset',
    entityId: preset.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { fields: Object.keys(input) },
  });

  return toView(preset);
}

/**
 * Copies a preset onto the live brand theme — the explicit act that changes
 * what a visitor sees. Separate from analysis on purpose (§9).
 */
export async function applyBrandPreset(
  user: AuthenticatedUser,
  businessId: string,
  key = 'default',
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const preset = await prisma.brandPreset.findFirst({
    where: { businessId: context.businessId, key },
  });

  if (!preset) throw new Error('There is no brand identity to apply yet.');

  const theme = await prisma.brandTheme.upsert({
    where: { businessId: context.businessId },
    update: {
      colorPrimary: preset.colorPrimary,
      colorSecondary: preset.colorSecondary,
      colorAccent: preset.colorAccent,
      colorBackground: preset.colorBackground,
      colorSurface: preset.colorSurface,
      colorText: preset.colorText,
      colorMuted: preset.colorMuted,
      colorBorder: preset.colorBorder,
      fontHeading: preset.fontHeading,
      fontBody: preset.fontBody,
      logoMediaId: preset.logoMediaId,
    },
    create: {
      businessId: context.businessId,
      colorPrimary: preset.colorPrimary,
      colorSecondary: preset.colorSecondary,
      colorAccent: preset.colorAccent,
      colorBackground: preset.colorBackground,
      colorSurface: preset.colorSurface,
      colorText: preset.colorText,
      colorMuted: preset.colorMuted,
      colorBorder: preset.colorBorder,
      fontHeading: preset.fontHeading,
      fontBody: preset.fontBody,
      logoMediaId: preset.logoMediaId,
    },
  });

  await recordAudit({
    action: 'brand.applied',
    entity: 'brand_theme',
    entityId: theme.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { presetKey: key },
  });

  return theme;
}
