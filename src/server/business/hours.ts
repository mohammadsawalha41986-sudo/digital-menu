import { z } from 'zod';

/**
 * Working hours (master spec §20, §44).
 *
 * Stored as structured JSON rather than free text so the public profile can
 * say "open now" later without parsing prose, and so Arabic and English
 * renderings come from the same data instead of two authored strings.
 */

export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM in 24-hour form');

const intervalSchema = z
  .object({ opens: timeSchema, closes: timeSchema })
  .refine((value) => value.opens !== value.closes, 'An interval cannot be zero-length');

const daySchema = z.object({
  closed: z.boolean().default(false),
  /** Multiple intervals support a split shift (e.g. a salon closing midday). */
  intervals: z.array(intervalSchema).max(3).default([]),
});

export const workingHoursSchema = z.object({
  timezone: z.string().min(1).default('Asia/Riyadh'),
  // Partial: a business may describe only the days it opens.
  days: z.partialRecord(z.enum(WEEKDAYS), daySchema),
});

export type WorkingHours = z.infer<typeof workingHoursSchema>;

/** Parses stored JSON, returning null rather than throwing on legacy shapes. */
export function parseWorkingHours(value: unknown): WorkingHours | null {
  const result = workingHoursSchema.safeParse(value);
  return result.success ? result.data : null;
}
