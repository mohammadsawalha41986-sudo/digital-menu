import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import { LOCALES } from '@/i18n/config';

/**
 * Input schemas for every admin write (master spec §127).
 *
 * Server actions receive `FormData` from a browser, which means every value
 * arrives as a string from an untrusted source. These schemas are the single
 * point where that becomes typed domain data — no action parses its own input.
 */

const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .catch(null);

const requiredText = (max = 200) => z.string().trim().min(1).max(max);

/** Keys become URL path segments and Excel match keys; keep them narrow. */
export const keySchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'Use lowercase letters, digits and hyphens');

const urlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .catch(null);

const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Expected a hex colour such as #1F2421');

/**
 * Phone numbers are rendered into `tel:` and `wa.me` links, so anything that
 * is not digits and formatting characters is rejected rather than escaped.
 */
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s()-]{6,20}$/, 'Expected a phone number')
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .catch(null);

export const businessSchema = z.object({
  nameAr: requiredText(),
  nameEn: optionalText(200),
  slug: keySchema,
  type: z.enum([
    'RESTAURANT',
    'CAFE',
    'BAKERY',
    'DESSERT',
    'SALON',
    'BEAUTY_CENTER',
    'SPA',
    'BARBER',
    'GYM',
    'HOTEL',
    'RETAIL',
    'OTHER',
  ]),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']),
  defaultLocale: z.enum(LOCALES),
  currency: z.enum(SUPPORTED_CURRENCIES),
  descriptionAr: optionalText(1000),
  descriptionEn: optionalText(1000),
  phone: phoneSchema,
  whatsapp: phoneSchema,
  email: z.string().trim().email().max(320).nullable().catch(null),
  website: urlSchema,
  instagram: urlSchema,
  tiktok: urlSchema,
  facebook: urlSchema,
  linkedin: urlSchema,
  youtube: urlSchema,
  googleMapsUrl: urlSchema,
  addressAr: optionalText(500),
  addressEn: optionalText(500),
  indexProfile: z.coerce.boolean().default(false),
  showPlatformFooter: z.coerce.boolean().default(false),
});

export const branchSchema = z.object({
  key: keySchema,
  nameAr: requiredText(),
  nameEn: optionalText(200),
  addressAr: optionalText(500),
  addressEn: optionalText(500),
  phone: phoneSchema,
  whatsapp: phoneSchema,
  googleMapsUrl: urlSchema,
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const brandSchema = z.object({
  colorPrimary: hexColor,
  colorSecondary: hexColor,
  colorAccent: hexColor,
  colorBackground: hexColor,
  colorSurface: hexColor,
  colorText: hexColor,
  colorMuted: hexColor,
  colorBorder: hexColor,
  fontHeading: z.enum(['system-sans', 'system-serif', 'system-mono']),
  fontBody: z.enum(['system-sans', 'system-serif', 'system-mono']),
  radiusScale: z.enum(['none', 'sm', 'md', 'lg']),
});

export const menuSchema = z.object({
  key: keySchema,
  titleAr: requiredText(),
  titleEn: optionalText(200),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const categorySchema = z.object({
  key: keySchema,
  nameAr: requiredText(),
  nameEn: optionalText(200),
  descriptionAr: optionalText(1000),
  descriptionEn: optionalText(1000),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.coerce.boolean().default(true),
  isFeatured: z.coerce.boolean().default(false),
});

/** Item codes are the Excel match key, so they are normalised on the way in. */
export const itemCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9._-]{0,62}$/, 'Use letters, digits, dots, dashes and underscores');

export const itemSchema = z.object({
  itemCode: itemCodeSchema,
  categoryKey: keySchema,
  nameAr: requiredText(),
  nameEn: optionalText(200),
  descriptionAr: optionalText(2000),
  descriptionEn: optionalText(2000),
  /** Raw price text; converted to minor units by the service, which knows the currency. */
  price: z.string().trim().max(32).default(''),
  /** Never inferred: an empty field means the business has not measured it. */
  calories: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : Number.parseInt(value, 10)))
    .refine((value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 20000), {
      message: 'Calories must be a whole number',
    })
    .nullable()
    .default(null),
  servingSizeAr: optionalText(120),
  servingSizeEn: optionalText(120),
  ingredientsAr: optionalText(2000),
  ingredientsEn: optionalText(2000),
  allergens: z.array(z.enum(['gluten', 'milk', 'egg', 'nuts', 'peanuts', 'soy', 'fish', 'shellfish'])).default([]),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  availability: z.enum(['AVAILABLE', 'UNAVAILABLE', 'SEASONAL', 'HIDDEN']),
  isFeatured: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const templateSelectionSchema = z.object({
  templateKey: z.string().trim().min(1).max(64),
  variantKey: z.string().trim().min(1).max(64),
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(256),
});

/** Turns FormData into a plain object before validation. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key).filter((value) => typeof value === 'string');
    // Repeated keys (checkbox groups) become arrays; single keys stay scalar.
    result[key] = key.endsWith('[]') || values.length > 1 ? values : values[0];
  }

  // Normalise the array convention so schemas do not need to know about it.
  for (const [key, value] of Object.entries(result)) {
    if (key.endsWith('[]')) {
      delete result[key];
      result[key.slice(0, -2)] = Array.isArray(value) ? value : [value];
    }
  }

  return result;
}
