import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { requireTenantContext, roleAtLeast, type AuthenticatedUser } from '@/server/tenancy/context';
import { ValidationError } from '@/server/admin/business-service';
import { isValidLatLng, type LatLng } from '@/lib/delivery';

/**
 * A restaurant's delivery area: where distance is measured from, and the fee
 * for each distance band. The farthest band is how far it delivers.
 *
 * Reading needs any role on the restaurant; changing it needs a manager,
 * because it changes what every customer pays.
 */

export const MAX_ZONES = 10;
export const MAX_DELIVERY_KM = 100;
const MAX_FEE_MINOR = 10_000_000;

export interface DeliveryZoneInput {
  maxKm: number;
  feeMinor: number;
}

export interface DeliverySettingsView {
  businessId: string;
  publicId: string;
  currency: string;
  origin: LatLng | null;
  zones: DeliveryZoneInput[];
  canEdit: boolean;
}

export async function getDeliverySettings(user: AuthenticatedUser, businessId: string): Promise<DeliverySettingsView> {
  const context = await requireTenantContext(user, businessId, 'VIEWER');
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: context.businessId },
    select: {
      publicId: true,
      currency: true,
      deliveryLat: true,
      deliveryLng: true,
      deliveryZones: { orderBy: { maxMeters: 'asc' }, select: { maxMeters: true, feeMinor: true } },
    },
  });

  return {
    businessId: context.businessId,
    publicId: business.publicId,
    currency: business.currency,
    origin:
      business.deliveryLat !== null && business.deliveryLng !== null
        ? { lat: Number(business.deliveryLat), lng: Number(business.deliveryLng) }
        : null,
    zones: business.deliveryZones.map((zone) => ({ maxKm: zone.maxMeters / 1000, feeMinor: zone.feeMinor })),
    canEdit: roleAtLeast(context.role, 'MANAGER'),
  };
}

/**
 * Replaces the restaurant's delivery area in one transaction, so a customer
 * never sees half of an edit. Returns the public identifier, so the caller can
 * refresh the public menu.
 */
export async function saveDeliverySettings(
  user: AuthenticatedUser,
  businessId: string,
  input: { origin: LatLng | null; zones: DeliveryZoneInput[] },
): Promise<{ publicId: string }> {
  const context = await requireTenantContext(user, businessId, 'MANAGER');
  const zones = validateZones(input.zones);

  if (input.origin && !isValidLatLng(input.origin)) {
    throw new ValidationError('The restaurant location is not a valid point. Paste a Google Maps link or use your current location.');
  }
  if (zones.length > 0 && !input.origin) {
    throw new ValidationError('Set the restaurant location first: distance is measured from it.');
  }

  const business = await prisma.$transaction(async (tx) => {
    const saved = await tx.business.update({
      where: { id: context.businessId },
      data: {
        deliveryLat: input.origin ? input.origin.lat.toFixed(6) : null,
        deliveryLng: input.origin ? input.origin.lng.toFixed(6) : null,
      },
      select: { publicId: true },
    });
    await tx.deliveryZone.deleteMany({ where: { businessId: context.businessId } });
    if (zones.length > 0) {
      await tx.deliveryZone.createMany({
        data: zones.map((zone) => ({
          businessId: context.businessId,
          maxMeters: Math.round(zone.maxKm * 1000),
          feeMinor: zone.feeMinor,
        })),
      });
    }
    return saved;
  });

  await recordAudit({
    action: 'delivery.updated',
    entity: 'business',
    entityId: context.businessId,
    businessId: context.businessId,
    userId: user.id,
    metadata: {
      zones: zones.length,
      limitKm: zones.length > 0 ? zones[zones.length - 1]!.maxKm : null,
      hasOrigin: Boolean(input.origin),
    },
  });

  return { publicId: business.publicId };
}

/** Sorted nearest first; refuses anything a customer could not be charged for sensibly. */
function validateZones(zones: DeliveryZoneInput[]): DeliveryZoneInput[] {
  if (zones.length > MAX_ZONES) throw new ValidationError(`Use at most ${MAX_ZONES} distance bands.`);

  const sorted = [...zones].sort((a, b) => a.maxKm - b.maxKm);
  for (const zone of sorted) {
    if (!Number.isFinite(zone.maxKm) || zone.maxKm <= 0 || zone.maxKm > MAX_DELIVERY_KM) {
      throw new ValidationError(`Each band needs a distance above 0 and up to ${MAX_DELIVERY_KM} km.`);
    }
    if (Math.round(zone.maxKm * 1000) < 100) {
      throw new ValidationError('A band must reach at least 0.1 km.');
    }
    if (!Number.isInteger(zone.feeMinor) || zone.feeMinor < 0 || zone.feeMinor > MAX_FEE_MINOR) {
      throw new ValidationError('Each band needs a fee of 0 or more.');
    }
  }
  for (let index = 1; index < sorted.length; index += 1) {
    if (Math.round(sorted[index]!.maxKm * 1000) === Math.round(sorted[index - 1]!.maxKm * 1000)) {
      throw new ValidationError('Two bands end at the same distance. Give each band its own distance.');
    }
  }
  return sorted;
}
