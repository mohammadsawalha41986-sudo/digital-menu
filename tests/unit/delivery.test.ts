import { describe, expect, it } from 'vitest';
import { distanceKm, isValidPhone, mapLink, parseLatLng, quoteDelivery, toLatinDigits } from '@/lib/delivery';

describe('distance', () => {
  it('measures one degree of latitude as about 111.2 km', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
  });

  it('is zero for the same point and the same in both directions', () => {
    const a = { lat: 24.7136, lng: 46.6753 };
    const b = { lat: 24.73, lng: 46.69 };
    expect(distanceKm(a, a)).toBe(0);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 9);
  });
});

describe('the fee for a distance', () => {
  // Entered out of order on purpose: the nearest band that covers the distance wins.
  const bands = [
    { maxKm: 6, fee: 10 },
    { maxKm: 3, fee: 5 },
  ];

  it('charges the nearest band, and a distance on a band limit is inside it', () => {
    expect(quoteDelivery(bands, 2.9)).toMatchObject({ status: 'in_range', fee: 5, bandMaxKm: 3 });
    expect(quoteDelivery(bands, 3)).toMatchObject({ status: 'in_range', fee: 5 });
    expect(quoteDelivery(bands, 3.01)).toMatchObject({ status: 'in_range', fee: 10 });
    expect(quoteDelivery(bands, 6)).toMatchObject({ status: 'in_range', fee: 10 });
  });

  it('refuses past the farthest band, and says where the limit is', () => {
    expect(quoteDelivery(bands, 6.01)).toMatchObject({ status: 'out_of_range', limitKm: 6 });
  });

  it('has no fee to offer when the restaurant set no bands', () => {
    expect(quoteDelivery([], 1)).toEqual({ status: 'no_zones', km: 1 });
  });
});

describe('reading a location an owner pastes', () => {
  it.each([
    ['24.7136, 46.6753', 24.7136, 46.6753],
    ['24.7136، 46.6753', 24.7136, 46.6753],
    ['https://www.google.com/maps/place/Restaurant/@24.7136,46.6753,17z', 24.7136, 46.6753],
    ['https://www.google.com/maps/place/x/data=!3m1!4b1!4m6!3m5!3d24.7136!4d46.6753', 24.7136, 46.6753],
    ['https://maps.google.com/?q=24.7136,46.6753', 24.7136, 46.6753],
    ['https://www.google.com/maps/search/?api=1&query=-33.86%2C151.21', -33.86, 151.21],
  ])('reads %s', (text, lat, lng) => {
    expect(parseLatLng(text)).toEqual({ lat, lng });
  });

  it.each(['https://maps.app.goo.gl/abc123', '91, 10', '10, 181', 'Riyadh', ''])('refuses %s', (text) => {
    expect(parseLatLng(text)).toBeNull();
  });

  it('builds a map link the driver can open', () => {
    expect(mapLink({ lat: 24.7136, lng: 46.6753 })).toBe('https://www.google.com/maps?q=24.713600,46.675300');
  });
});

describe('the customer phone number', () => {
  it.each(['0551234567', '+966 55 123 4567', '055-123-4567', '٠٥٥١٢٣٤٥٦٧'])('accepts %s', (phone) => {
    expect(isValidPhone(phone)).toBe(true);
  });

  it.each(['12345', 'abc', '', '+966 55 123 4567 8901 23'])('refuses %s', (phone) => {
    expect(isValidPhone(phone)).toBe(false);
  });

  it('reads Arabic-Indic and Persian digits as 0-9', () => {
    expect(toLatinDigits('٠٥٥ ۱۲۳')).toBe('055 123');
  });
});
