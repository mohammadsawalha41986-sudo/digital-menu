'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/server/auth/current-user';
import { invalidateProfile } from '@/server/profile/cache';
import { TenantAccessError } from '@/server/tenancy/context';
import { ValidationError } from './business-service';
import { getDeliverySettings, saveDeliverySettings, type DeliveryZoneInput } from '@/server/delivery/service';
import { parsePriceToMinor } from '@/lib/money';
import { toLatinDigits, type LatLng } from '@/lib/delivery';

export interface DeliveryFormInput {
  lat: string;
  lng: string;
  zones: { maxKm: string; fee: string }[];
}

export type DeliveryResult = { ok: true; message: string } | { ok: false; error: string };

/** A decimal number as an owner types it: Arabic digits and a comma decimal are fine. */
function readNumber(text: string): number | null {
  const normalized = toLatinDigits(text.trim()).replace(/[٫،,]/g, '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

export async function saveDeliveryAction(businessId: string, input: DeliveryFormInput): Promise<DeliveryResult> {
  const user = await requireUser();
  try {
    const { currency } = await getDeliverySettings(user, businessId);

    let origin: LatLng | null = null;
    const latText = input.lat.trim();
    const lngText = input.lng.trim();
    if (latText || lngText) {
      const lat = readNumber(latText);
      const lng = readNumber(lngText);
      if (lat === null || lng === null) {
        return { ok: false, error: 'Enter both latitude and longitude, or paste a Google Maps link.' };
      }
      origin = { lat, lng };
    }

    const zones: DeliveryZoneInput[] = [];
    for (const [index, row] of input.zones.entries()) {
      if (!row.maxKm.trim() && !row.fee.trim()) continue; // an empty row the owner added and left
      const maxKm = readNumber(row.maxKm);
      if (maxKm === null) return { ok: false, error: `Band ${index + 1}: enter the distance in km, for example 3 or 2.5.` };
      const feeMinor = parsePriceToMinor(row.fee, currency);
      if (feeMinor === null) return { ok: false, error: `Band ${index + 1}: enter the fee, or 0 for free delivery.` };
      zones.push({ maxKm, feeMinor });
    }

    const { publicId } = await saveDeliverySettings(user, businessId, { origin, zones });
    invalidateProfile(publicId);
    revalidatePath(`/admin/businesses/${businessId}/delivery`);
    revalidatePath(`/m/${publicId}`);

    return {
      ok: true,
      message:
        zones.length === 0
          ? 'Saved. No delivery fee is added automatically; the restaurant confirms it.'
          : `Saved. Delivery covers up to ${Math.max(...zones.map((zone) => zone.maxKm))} km, with ${zones.length} ${zones.length === 1 ? 'band' : 'bands'}.`,
    };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    if (error instanceof TenantAccessError) return { ok: false, error: 'Not found, or you do not have permission for this.' };
    console.error('[admin] delivery settings failed', error);
    return { ok: false, error: 'Something went wrong. Nothing was changed. Try again.' };
  }
}
