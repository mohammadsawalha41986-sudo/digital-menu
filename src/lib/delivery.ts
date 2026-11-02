/**
 * Delivery by distance: how far a customer is from the restaurant, and what
 * that distance costs.
 *
 * Shared by the server (validating what the owner saves) and the browser (the
 * cart works out the fee once the customer shares a location). Nothing here
 * reads the network or the database.
 *
 * Distance is a straight line between two points on the globe. Roads are
 * longer, usually by a fifth to two fifths, which is why the settings screen
 * tells the owner to leave a margin. Road distance needs a paid maps service.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** One band: an order up to `maxKm` away costs `fee` (in the unit the caller uses). */
export interface DeliveryBand {
  maxKm: number;
  fee: number;
}

export type DeliveryQuote =
  | { status: 'in_range'; km: number; fee: number; bandMaxKm: number }
  | { status: 'out_of_range'; km: number; limitKm: number }
  | { status: 'no_zones'; km: number };

const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(from: LatLng, to: LatLng): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The fee for a distance. Bands may arrive in any order; the nearest band that
 * covers the distance wins, and a distance exactly on a band's limit is inside it.
 */
export function quoteDelivery(bands: readonly DeliveryBand[], km: number): DeliveryQuote {
  if (bands.length === 0) return { status: 'no_zones', km };
  const sorted = [...bands].sort((a, b) => a.maxKm - b.maxKm);
  const band = sorted.find((candidate) => km <= candidate.maxKm);
  if (!band) return { status: 'out_of_range', km, limitKm: sorted[sorted.length - 1]!.maxKm };
  return { status: 'in_range', km, fee: band.fee, bandMaxKm: band.maxKm };
}

export function isValidLatLng(point: LatLng): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

/**
 * Reads a location from what an owner is likely to paste: "24.7136, 46.6753",
 * or a Google Maps address carrying the point as `@lat,lng`, `q=lat,lng`,
 * `query=lat,lng`, `ll=lat,lng` or `!3dlat!4dlng`. Short links (maps.app.goo.gl)
 * hide the point behind a redirect and cannot be read without following it.
 */
export function parseLatLng(text: string): LatLng | null {
  const input = text.trim();
  if (!input) return null;
  const number = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const patterns = [
    new RegExp(`!3d${number}!4d${number}`),
    new RegExp(`@${number},${number}`),
    new RegExp(`[?&](?:q|query|ll|destination)=${number}(?:,|%2C)\\s*${number}`, 'i'),
    new RegExp(`^${number}\\s*[,،\\s]\\s*${number}$`),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(input);
    if (match) {
      const point = { lat: Number(match[1]), lng: Number(match[2]) };
      if (isValidLatLng(point)) return point;
    }
  }
  return null;
}

/** A link that opens the point in the customer's or the driver's map app. */
export function mapLink(point: LatLng): string {
  return `https://www.google.com/maps?q=${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

/**
 * A phone number a driver can call: 8 to 15 digits, an optional leading +,
 * spaces and dashes allowed while typing.
 */
export function isValidPhone(text: string): boolean {
  const compact = text.replace(/[\s-]/g, '');
  return /^\+?\d{8,15}$/.test(toLatinDigits(compact));
}

/** Arabic-Indic and Persian digits typed on a phone keyboard, read as 0-9. */
export function toLatinDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}
