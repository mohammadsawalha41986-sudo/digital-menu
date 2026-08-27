'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/server/auth/current-user';
import { TenantAccessError } from '@/server/tenancy/context';
import { ValidationError } from '@/server/admin/business-service';
import { deleteOffer, upsertOffer } from '@/server/offers/service';
import { OfferWindowError } from '@/server/offers/scheduling';
import { parseLocalDateTime } from '@/server/offers/datetime';
import { formDataToObject, keySchema } from './validation';
import type { ActionState } from './actions';

/**
 * Offer actions.
 *
 * Dates arrive from `<input type="datetime-local">`, which submits a wall-clock
 * string with no zone. They are interpreted in the business's configured
 * timezone rather than the server's, so an offer scheduled for "23:00" ends at
 * 23:00 where the restaurant is, not where the container runs.
 */

const offerSchema = z.object({
  key: keySchema,
  titleAr: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().max(200).optional().transform((value) => value || null),
  descriptionAr: z.string().trim().max(1000).optional().transform((value) => value || null),
  descriptionEn: z.string().trim().max(1000).optional().transform((value) => value || null),
  originalPrice: z.string().trim().max(32).optional().transform((value) => value || null),
  offerPrice: z.string().trim().max(32).optional().transform((value) => value || null),
  ctaLabelAr: z.string().trim().max(80).optional().transform((value) => value || null),
  ctaLabelEn: z.string().trim().max(80).optional().transform((value) => value || null),
  ctaUrl: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .transform((value) => value || null)
    .refine((value) => value === null || /^https?:\/\//i.test(value), {
      message: 'The call-to-action link must be an http or https URL',
    }),
  startsAt: z.string().trim().optional().transform((value) => value || null),
  endsAt: z.string().trim().optional().transform((value) => value || null),
  timezone: z.string().trim().min(1).max(64).default('Asia/Riyadh'),
  placement: z.enum(['HERO', 'FEATURED', 'BANNER', 'SECTION']),
  isActive: z.coerce.boolean().default(true),
  isFeatured: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export async function upsertOfferAction(
  businessId: string,
  publicId: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const parsed = offerSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    await upsertOffer(user, businessId, {
      ...parsed.data,
      startsAt: parseLocalDateTime(parsed.data.startsAt, parsed.data.timezone),
      endsAt: parseLocalDateTime(parsed.data.endsAt, parsed.data.timezone),
      discountPercent: null,
    });

    revalidatePath(`/admin/businesses/${businessId}/offers`);
    revalidatePath(`/m/${publicId}`);

    return { ok: true, message: 'Offer saved' };
  } catch (error) {
    if (error instanceof ValidationError || error instanceof OfferWindowError) {
      return { error: error.message };
    }
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}

export async function deleteOfferAction(
  businessId: string,
  offerId: string,
  publicId: string,
): Promise<ActionState> {
  const user = await requireUser();

  try {
    await deleteOffer(user, businessId, offerId);
    revalidatePath(`/admin/businesses/${businessId}/offers`);
    revalidatePath(`/m/${publicId}`);
    return { ok: true, message: 'Offer removed' };
  } catch (error) {
    if (error instanceof TenantAccessError) return { error: 'Not found or access denied' };
    throw error;
  }
}
