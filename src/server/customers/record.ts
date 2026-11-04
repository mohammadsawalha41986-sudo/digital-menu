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
/** A ceiling on any one amount, in minor units: 1,000,000.00. */
const MAX_AMOUNT_MINOR = 100_000_000;

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
    select: { id: true, currency: true, offersSignupEnabled: true },
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
    .filter((line) => line.code && line.qty >= 1 && line.qty <= MAX_QTY && line.totalMinor !== null && line.totalMinor <= MAX_AMOUNT_MINOR);
  if (lines.length === 0) return null;

  const dishes = await prisma.menuItem.findMany({
    where: { businessId: business.id, itemCode: { in: Array.from(new Set(lines.flatMap((line) => [line.code, line.code.toUpperCase()]))) } },
    select: { itemCode: true, nameAr: true, nameEn: true },
  });
  const byCode = new Map(dishes.map((dish) => [dish.itemCode, dish]));
  const known = lines
    .map((line) => ({ ...line, dish: byCode.get(line.code) ?? byCode.get(line.code.toUpperCase()) }))
    .filter((line): line is typeof line & { dish: NonNullable<typeof line.dish> } => Boolean(line.dish));
  if (known.length === 0) return null;

  const subtotalMinor = known.reduce((sum, line) => sum + (line.totalMinor ?? 0), 0);
  const feeMinor = input.orderType === 'delivery' ? Math.min(toMinorUnits(input.deliveryFee, currency) ?? 0, MAX_AMOUNT_MINOR) : 0;
  const totalMinor = subtotalMinor + feeMinor;
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
            ...(optIn ? { marketingOptIn: true, optInAt: now, optInSource: 'cart' } : {}),
          },
          update: {
            ...(name ? { name } : {}),
            orderCount: { increment: 1 },
            totalSpentMinor: { increment: totalMinor },
            lastOrderAt: now,
            ...(optIn ? { marketingOptIn: true, optInAt: now, optInSource: 'cart', optOutAt: null } : {}),
          },
          select: { id: true },
        })
      : null;

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
 * turned sign-up on; saying yes again after opting out is new consent.
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

  await prisma.customer.upsert({
    where: { businessId_phone: { businessId: business.id, phone } },
    create: { businessId: business.id, phone, name, marketingOptIn: true, optInAt: now, optInSource: 'signup' },
    update: { ...(name ? { name } : {}), marketingOptIn: true, optInAt: now, optInSource: 'signup', optOutAt: null },
  });
  return true;
}
