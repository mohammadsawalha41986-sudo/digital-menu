import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { parsePriceToMinor } from '@/lib/money';
import { ValidationError } from '@/server/admin/business-service';
import {
  TenantAccessError,
  requireTenantContext,
  tenantScope,
  type AuthenticatedUser,
} from '@/server/tenancy/context';
import { assertValidWindow, offerState } from './scheduling';

/**
 * Offer management (master spec §41–§43).
 *
 * Prices arrive as operator-typed text and are converted here, where the
 * business currency is known. An unreadable price fails the save rather than
 * being guessed — promotional pricing is exactly where a guess costs money.
 */

export interface OfferInput {
  key: string;
  titleAr: string;
  titleEn?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  originalPrice?: string | null;
  offerPrice?: string | null;
  discountPercent?: number | null;
  ctaLabelAr?: string | null;
  ctaLabelEn?: string | null;
  ctaUrl?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  timezone?: string;
  placement: 'HERO' | 'FEATURED' | 'BANNER' | 'SECTION';
  isActive: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
}

export async function upsertOffer(
  user: AuthenticatedUser,
  businessId: string,
  input: OfferInput,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: context.businessId },
    select: { currency: true },
  });

  assertValidWindow(input.startsAt ?? null, input.endsAt ?? null);

  const originalPriceMinor = readPrice(input.originalPrice, business.currency, 'original price');
  const offerPriceMinor = readPrice(input.offerPrice, business.currency, 'offer price');

  if (
    originalPriceMinor !== null &&
    offerPriceMinor !== null &&
    offerPriceMinor >= originalPriceMinor
  ) {
    throw new ValidationError('The offer price is not lower than the original price');
  }

  const data = {
    titleAr: input.titleAr,
    titleEn: input.titleEn ?? null,
    descriptionAr: input.descriptionAr ?? null,
    descriptionEn: input.descriptionEn ?? null,
    originalPriceMinor,
    offerPriceMinor,
    discountPercent: input.discountPercent ?? null,
    ctaLabelAr: input.ctaLabelAr ?? null,
    ctaLabelEn: input.ctaLabelEn ?? null,
    ctaUrl: input.ctaUrl ?? null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    timezone: input.timezone ?? 'Asia/Riyadh',
    placement: input.placement,
    isActive: input.isActive,
    isFeatured: input.isFeatured ?? false,
    sortOrder: input.sortOrder ?? 0,
  };

  const existing = await prisma.offer.findUnique({
    where: { businessId_key: { businessId: context.businessId, key: input.key } },
    select: { id: true },
  });

  const offer = await prisma.offer.upsert({
    where: { businessId_key: { businessId: context.businessId, key: input.key } },
    update: data,
    create: { ...data, businessId: context.businessId, key: input.key },
  });

  await recordAudit({
    action: existing ? 'offer.updated' : 'offer.created',
    entity: 'offer',
    entityId: offer.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { key: offer.key, state: offerState(offer), placement: offer.placement },
  });

  return offer;
}

export async function deleteOffer(user: AuthenticatedUser, businessId: string, offerId: string) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const result = await prisma.offer.deleteMany({
    where: { id: offerId, ...tenantScope(context) },
  });

  if (result.count === 0) throw new TenantAccessError('Offer not found');

  await recordAudit({
    action: 'offer.deleted',
    entity: 'offer',
    entityId: offerId,
    businessId: context.businessId,
    userId: user.id,
  });
}

/** Admin listing: every offer, with its computed state. */
export async function listOffersForAdmin(user: AuthenticatedUser, businessId: string) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const offers = await prisma.offer.findMany({
    where: tenantScope(context),
    orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
  });

  const now = new Date();
  return offers.map((offer) => ({ ...offer, state: offerState(offer, now) }));
}

function readPrice(
  value: string | null | undefined,
  currency: string,
  label: string,
): number | null {
  if (value === null || value === undefined || value.trim() === '') return null;

  const minor = parsePriceToMinor(value, currency);
  if (minor === null) throw new ValidationError(`Could not read the ${label} "${value}"`);

  return minor;
}
