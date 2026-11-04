import { prisma } from '@/server/db/client';
import { countryCodeFor, isOrderType, normalizePhone, toMinorUnits } from '@/lib/customers';

/**
 * What the public menu writes: an order as it leaves for WhatsApp, and a
 * sign-up for offers. Both are anonymous, untrusted input, so everything is
 * bounded here and an unknown or inactive restaurant is simply ignored.
 *
 * An order is recorded as the customer sent it. Dishes the restaurant does not
 * have are dropped, and the subtotal is the sum of the lines that remain, so
 * the totals always add up.
 */

const MAX_LINES = 50;
const MAX_QTY = 99;
/**
 * What one unit of a dish can come to with its options: three times its price
 * plus room for paid extras. A line above that is not a real order line and is
 * dropped. A dish with no price gets a flat allowance per unit.
 */
const EXTRAS_PER_UNIT_MINOR = 10_000;
const UNPRICED_UNIT_MINOR = 50_000;
/** No menu order is worth more than this (50,000.00); anything above is refused. */
const MAX_ORDER_MINOR = 5_000_000;

function unitCeiling(priceMinor: number | null): number {
  return priceMinor && priceMinor > 0 ? priceMinor * 3 + EXTRAS_PER_UNIT_MINOR : UNPRICED_UNIT_MINOR;
}

export interface MenuOrderLine {
  code: unknown;
  qty: unknown;
  total: unknown;
}

export interface MenuOrderInput {
  orderType: unknown;
  name?: unknown;
  phone?: unknown;
  table?: unknown;
  locale?: unknown;
  offers?: unknown;
  items: unknown;
  deliveryFee?: unknown;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed === '' ? null : trimmed;
}

/** Records an order sent from the menu. Returns the order id, or null when nothing was recorded. */
export async function recordMenuOrder(publicId: string, input: MenuOrderInput): Promise<string | null> {
  if (!isOrderType(input.orderType) || !Array.isArray(input.items)) return null;

  const business = await prisma.business.findFirst({
    where: { publicId, status: 'ACTIVE' },
    select: {
      id: true,
      currency: true,
      offersSignupEnabled: true,
      deliveryZones: { orderBy: { feeMinor: 'desc' }, take: 1, select: { feeMinor: true } },
    },
  });
  if (!business) return null;
  const { currency } = business;

  const lines = (input.items as MenuOrderLine[])
    .slice(0, MAX_LINES)
    .map((line) => ({
      code: typeof line?.code === 'string' ? line.code.trim().slice(0, 64) : '',
      qty: typeof line?.qty === 'number' && Number.isInteger(line.qty) ? line.qty : 0,
      totalMinor: toMinorUnits(line?.total, currency),
    }))
    .filter((line) => line.code && line.qty >= 1 && line.qty <= MAX_QTY && line.totalMinor !== null);
  if (lines.length === 0) return null;

  const dishes = await prisma.menuItem.findMany({
    where: { businessId: business.id, itemCode: { in: Array.from(new Set(lines.flatMap((line) => [line.code, line.code.toUpperCase()]))) } },
    select: { itemCode: true, nameAr: true, nameEn: true, priceMinor: true },
  });
  const byCode = new Map(dishes.map((dish) => [dish.itemCode, dish]));
  const known = lines
    .map((line) => ({ ...line, dish: byCode.get(line.code) ?? byCode.get(line.code.toUpperCase()) }))
    .filter((line): line is typeof line & { dish: NonNullable<typeof line.dish> } => Boolean(line.dish))
    .filter((line) => (line.totalMinor ?? 0) <= unitCeiling(line.dish.priceMinor) * line.qty);
  if (known.length === 0) return null;

  const subtotalMinor = known.reduce((sum, line) => sum + (line.totalMinor ?? 0), 0);
  // A delivery fee is at most the restaurant's own highest fee; with no zones the restaurant sets it later.
  const highestFee = business.deliveryZones[0]?.feeMinor ?? 0;
  const feeMinor = input.orderType === 'delivery' ? Math.min(toMinorUnits(input.deliveryFee, currency) ?? 0, highestFee) : 0;
  const totalMinor = subtotalMinor + feeMinor;
  if (totalMinor > MAX_ORDER_MINOR) return null;
  const name = text(input.name, 80);
  const phone = typeof input.phone === 'string' ? normalizePhone(input.phone, countryCodeFor(currency)) : null;
  const optIn = input.offers === true && business.offersSignupEnabled && phone !== null;
  const now = new Date();

  const order = await prisma.$transaction(async (tx) => {
    const customer = phone
      ? await tx.customer.upsert({
          where: { businessId_phone: { businessId: business.id, phone } },
          create: {
            businessId: business.id,
            phone,
            name,
            orderCount: 1,
            totalSpentMinor: totalMinor,
            lastOrderAt: now,
          },
          update: {
            ...(name ? { name } : {}),
            orderCount: { increment: 1 },
            totalSpentMinor: { increment: totalMinor },
            lastOrderAt: now,
          },
          select: { id: true },
        })
      : null;
    if (customer && optIn) await markOptedIn(tx, customer.id, now, 'cart');

    return tx.customerOrder.create({
      data: {
        businessId: business.id,
        customerId: customer?.id ?? null,
        orderType: input.orderType as string,
        customerName: name,
        customerPhone: phone,
        tableNumber: input.orderType === 'dineIn' ? text(input.table, 20) : null,
        locale: text(input.locale, 8),
        currency,
        subtotalMinor,
        deliveryFeeMinor: feeMinor,
        totalMinor,
        itemCount: known.reduce((sum, line) => sum + line.qty, 0),
        items: {
          create: known.map((line) => ({
            businessId: business.id,
            itemCode: line.dish.itemCode,
            nameAr: line.dish.nameAr,
            nameEn: line.dish.nameEn,
            quantity: line.qty,
            lineTotalMinor: line.totalMinor ?? 0,
          })),
        },
      },
      select: { id: true },
    });
  });

  return order.id;
}

/**
 * A customer asking for the restaurant's offers. Only when the restaurant has
 * turned sign-up on, and never over an opt-out the restaurant recorded.
 */
export async function subscribeToOffers(publicId: string, input: { name?: unknown; phone?: unknown }): Promise<boolean> {
  const business = await prisma.business.findFirst({
    where: { publicId, status: 'ACTIVE', offersSignupEnabled: true },
    select: { id: true, currency: true },
  });
  if (!business) return false;

  const phone = typeof input.phone === 'string' ? normalizePhone(input.phone, countryCodeFor(business.currency)) : null;
  if (!phone) return false;
  const name = text(input.name, 80);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { businessId_phone: { businessId: business.id, phone } },
      create: { businessId: business.id, phone, name },
      update: { ...(name ? { name } : {}) },
      select: { id: true },
    });
    await markOptedIn(tx, customer.id, now, 'signup');
  });
  // The same answer whether or not the number had opted out: the menu must
  // not reveal what the restaurant holds about a number.
  return true;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Adds a customer to the offers list, unless the restaurant recorded that
 * they asked to stop. A public request carries no proof of who owns the
 * number, so it can never undo an opt-out; only the restaurant can.
 */
async function markOptedIn(tx: Tx, customerId: string, now: Date, source: 'cart' | 'signup') {
  await tx.customer.updateMany({
    where: { id: customerId, optOutAt: null, marketingOptIn: false },
    data: { marketingOptIn: true, optInAt: now, optInSource: source },
  });
}
