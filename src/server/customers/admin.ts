import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { ValidationError } from '@/server/admin/business-service';
import { requireTenantContext, type AuthenticatedUser } from '@/server/tenancy/context';
import { csvCell, whatsappChatLink } from '@/lib/customers';
import { minorUnitDigits } from '@/lib/money';

/**
 * The restaurant's customers and the orders sent from its menu, for the
 * people who run it. Phone numbers are personal data, so every read and
 * change here needs a manager or the owner, and exports and erasures are
 * audited.
 *
 * Amounts are what the customer's cart showed when the order was sent;
 * cancelled orders are left out of every total.
 */

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];
const ZONE = 'Asia/Riyadh';
const RECENT_ORDERS = 50;
const MAX_CUSTOMERS = 500;

export function readRange(value: unknown): RangeDays {
  const days = Number(value);
  return (RANGES as readonly number[]).includes(days) ? (days as RangeDays) : 30;
}

export interface CustomerDashboard {
  businessId: string;
  publicId: string;
  currency: string;
  days: RangeDays;
  offersSignupEnabled: boolean;
  totals: {
    orders: number;
    cancelled: number;
    salesMinor: number;
    averageMinor: number;
    customers: number;
    returningCustomers: number;
    subscribers: number;
    newSubscribers: number;
  };
  topDishes: { code: string; nameAr: string; nameEn: string | null; quantity: number; salesMinor: number; orders: number }[];
  byDay: { day: string; orders: number; salesMinor: number }[];
  byHour: { hour: number; orders: number }[];
  byType: { type: string; orders: number; salesMinor: number }[];
  recentOrders: {
    id: string;
    createdAt: Date;
    status: 'SENT' | 'CONFIRMED' | 'CANCELLED';
    orderType: string;
    customerName: string | null;
    customerPhone: string | null;
    tableNumber: string | null;
    totalMinor: number;
    deliveryFeeMinor: number;
    items: { nameAr: string; quantity: number }[];
  }[];
}

export async function getCustomerDashboard(user: AuthenticatedUser, businessId: string, days: RangeDays): Promise<CustomerDashboard> {
  const context = await requireTenantContext(user, businessId, 'MANAGER');
  const id = context.businessId;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const live = { businessId: id, createdAt: { gte: since }, status: { not: 'CANCELLED' as const } };

  // Sums are taken as BIGINT and read back as numbers: a total over many
  // orders must never overflow a 32-bit column type. The window start is
  // compared in UTC whatever the database session's time zone is.
  const from = Prisma.sql`(${since}::timestamptz AT TIME ZONE 'UTC')`;
  const liveSql = Prisma.sql`o."businessId" = ${id} AND o."createdAt" >= ${from} AND o.status <> 'CANCELLED'`;

  const [business, sums, cancelled, phones, subscribers, newSubscribers, dishes, byType, recent, byDay, byHour] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id }, select: { publicId: true, currency: true, offersSignupEnabled: true } }),
    prisma.$queryRaw<{ orders: bigint; sales: bigint }[]>(Prisma.sql`
      SELECT count(*) AS orders, coalesce(sum(o."totalMinor"), 0)::bigint AS sales FROM customer_orders o WHERE ${liveSql}`),
    prisma.customerOrder.count({ where: { businessId: id, createdAt: { gte: since }, status: 'CANCELLED' } }),
    prisma.customerOrder.groupBy({ by: ['customerPhone'], where: { ...live, customerPhone: { not: null } }, _count: { _all: true } }),
    prisma.customer.count({ where: { businessId: id, marketingOptIn: true } }),
    prisma.customer.count({ where: { businessId: id, marketingOptIn: true, optInAt: { gte: since } } }),
    prisma.$queryRaw<{ code: string; quantity: bigint; sales: bigint; orders: bigint }[]>(Prisma.sql`
      SELECT i."itemCode" AS code, sum(i.quantity)::bigint AS quantity, sum(i."lineTotalMinor")::bigint AS sales, count(DISTINCT i."orderId") AS orders
      FROM customer_order_items i JOIN customer_orders o ON o.id = i."orderId"
      WHERE i."businessId" = ${id} AND ${liveSql}
      GROUP BY i."itemCode" ORDER BY 2 DESC, 3 DESC LIMIT 10`),
    prisma.$queryRaw<{ type: string; orders: bigint; sales: bigint }[]>(Prisma.sql`
      SELECT o."orderType" AS type, count(*) AS orders, coalesce(sum(o."totalMinor"), 0)::bigint AS sales
      FROM customer_orders o WHERE ${liveSql} GROUP BY 1 ORDER BY 2 DESC`),
    prisma.customerOrder.findMany({
      where: { businessId: id },
      orderBy: { createdAt: 'desc' },
      take: RECENT_ORDERS,
      select: {
        id: true,
        createdAt: true,
        status: true,
        orderType: true,
        customerName: true,
        customerPhone: true,
        tableNumber: true,
        totalMinor: true,
        deliveryFeeMinor: true,
        items: { select: { nameAr: true, quantity: true } },
      },
    }),
    prisma.$queryRaw<{ day: string; orders: bigint; sales: bigint }[]>(Prisma.sql`
      SELECT to_char((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${ZONE}, 'YYYY-MM-DD') AS day,
             count(*) AS orders, coalesce(sum(o."totalMinor"), 0)::bigint AS sales
      FROM customer_orders o WHERE ${liveSql}
      GROUP BY 1 ORDER BY 1`),
    prisma.$queryRaw<{ hour: number; orders: bigint }[]>(Prisma.sql`
      SELECT extract(hour FROM (o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${ZONE})::int AS hour, count(*) AS orders
      FROM customer_orders o WHERE ${liveSql}
      GROUP BY 1 ORDER BY 1`),
  ]);

  // Dish names as the menu has them now; an order's own copy when the dish is gone.
  const codes = dishes.map((row) => row.code);
  const [current, recorded] = await Promise.all([
    prisma.menuItem.findMany({ where: { businessId: id, itemCode: { in: codes } }, select: { itemCode: true, nameAr: true, nameEn: true } }),
    prisma.customerOrderItem.findMany({
      where: { businessId: id, itemCode: { in: codes } },
      distinct: ['itemCode'],
      orderBy: { order: { createdAt: 'desc' } },
      select: { itemCode: true, nameAr: true, nameEn: true },
    }),
  ]);
  const names = new Map([...recorded, ...current].map((row) => [row.itemCode, row]));

  const orders = Number(sums[0]?.orders ?? 0);
  const salesMinor = Number(sums[0]?.sales ?? 0);

  return {
    businessId: id,
    publicId: business.publicId,
    currency: business.currency,
    days,
    offersSignupEnabled: business.offersSignupEnabled,
    totals: {
      orders,
      cancelled,
      salesMinor,
      averageMinor: orders > 0 ? Math.round(salesMinor / orders) : 0,
      customers: phones.length,
      returningCustomers: phones.filter((row) => row._count._all > 1).length,
      subscribers,
      newSubscribers,
    },
    topDishes: dishes.map((row) => ({
      code: row.code,
      nameAr: names.get(row.code)?.nameAr ?? row.code,
      nameEn: names.get(row.code)?.nameEn ?? null,
      quantity: Number(row.quantity),
      salesMinor: Number(row.sales),
      orders: Number(row.orders),
    })),
    byDay: byDay.map((row) => ({ day: row.day, orders: Number(row.orders), salesMinor: Number(row.sales) })),
    byHour: byHour.map((row) => ({ hour: row.hour, orders: Number(row.orders) })),
    byType: byType.map((row) => ({ type: row.type, orders: Number(row.orders), salesMinor: Number(row.sales) })),
    recentOrders: recent,
  };
}

export interface CustomerRow {
  id: string;
  name: string | null;
  phone: string;
  orderCount: number;
  totalSpentMinor: number;
  lastOrderAt: Date | null;
  createdAt: Date;
  marketingOptIn: boolean;
  optInSource: string | null;
  /** Set when the customer asked the restaurant to stop offers. */
  optOutAt: Date | null;
}

export async function listCustomers(
  user: AuthenticatedUser,
  businessId: string,
  options: { subscribersOnly?: boolean; query?: string } = {},
): Promise<CustomerRow[]> {
  const context = await requireTenantContext(user, businessId, 'MANAGER');
  const query = options.query?.trim().slice(0, 60);
  // "055…" finds "96655…": the local leading zero is not part of the stored number.
  const digits = query?.replace(/\D/g, '').replace(/^0+/, '');
  const rows = await prisma.customer.findMany({
    where: {
      businessId: context.businessId,
      ...(options.subscribersOnly ? { marketingOptIn: true } : {}),
      ...(query
        ? { OR: [{ name: { contains: query, mode: 'insensitive' as const } }, ...(digits ? [{ phone: { contains: digits } }] : [])] }
        : {}),
    },
    orderBy: [{ lastOrderAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: MAX_CUSTOMERS,
    select: {
      id: true,
      name: true,
      phone: true,
      orderCount: true,
      totalSpentMinor: true,
      lastOrderAt: true,
      createdAt: true,
      marketingOptIn: true,
      optInSource: true,
      optOutAt: true,
    },
  });
  return rows.map((row) => ({ ...row, totalSpentMinor: Number(row.totalSpentMinor) }));
}

const STATUSES = ['SENT', 'CONFIRMED', 'CANCELLED'] as const;
type OrderStatus = (typeof STATUSES)[number];

/**
 * Marks an order confirmed, cancelled, or back to sent. A cancelled order
 * leaves its customer's count and total, and comes back if un-cancelled.
 */
export async function setOrderStatus(user: AuthenticatedUser, businessId: string, orderId: string, status: string): Promise<void> {
  const context = await requireTenantContext(user, businessId, 'MANAGER');
  if (!(STATUSES as readonly string[]).includes(status)) throw new ValidationError('Unknown order status.');
  const next = status as OrderStatus;

  await prisma.$transaction(async (tx) => {
    const order = await tx.customerOrder.findFirst({
      where: { id: orderId, businessId: context.businessId },
      select: { id: true, status: true, customerId: true, totalMinor: true },
    });
    if (!order) throw new ValidationError('That order was not found.');
    if (order.status === next) return;

    // Changed only from the status just read: of two changes made at once, one
    // wins and the other changes nothing, so a cancellation is counted once.
    const { count } = await tx.customerOrder.updateMany({ where: { id: order.id, status: order.status }, data: { status: next } });
    if (count === 0) return;
    const leaving = next === 'CANCELLED' && order.status !== 'CANCELLED';
    const returning = order.status === 'CANCELLED' && next !== 'CANCELLED';
    if (order.customerId && (leaving || returning)) {
      const sign = leaving ? -1 : 1;
      await tx.customer.update({
        where: { id: order.customerId },
        data: { orderCount: { increment: sign }, totalSpentMinor: { increment: BigInt(sign * order.totalMinor) } },
      });
    }
  });

  await recordAudit({
    action: 'order.status_changed',
    entity: 'customer_order',
    entityId: orderId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { status: next },
  });
}

/** Turns the public sign-up (and the cart's opt-in box) on or off. Returns the public id to refresh. */
export async function setOffersSignup(user: AuthenticatedUser, businessId: string, enabled: boolean): Promise<{ publicId: string }> {
  const context = await requireTenantContext(user, businessId, 'MANAGER');
  const business = await prisma.business.update({
    where: { id: context.businessId },
    data: { offersSignupEnabled: enabled },
    select: { publicId: true },
  });
  await recordAudit({
    action: 'customers.settings_updated',
    entity: 'business',
    entityId: context.businessId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { offersSignupEnabled: enabled },
  });
  return business;
}

/** The customer asked to stop receiving offers. Their orders stay. */
export async function optOutCustomer(user: AuthenticatedUser, businessId: string, customerId: string): Promise<void> {
  const context = await requireTenantContext(user, businessId, 'MANAGER');
  const { count } = await prisma.customer.updateMany({
    where: { id: customerId, businessId: context.businessId },
    data: { marketingOptIn: false, optOutAt: new Date() },
  });
  if (count === 0) throw new ValidationError('That customer was not found.');
  await recordAudit({ action: 'customer.opted_out', entity: 'customer', entityId: customerId, businessId: context.businessId, userId: user.id });
}

/**
 * The customer asked to be forgotten: their record is deleted and their name
 * and number are removed from their orders. The orders themselves stay, so
 * the restaurant's totals do not change.
 */
export async function forgetCustomer(user: AuthenticatedUser, businessId: string, customerId: string): Promise<void> {
  const context = await requireTenantContext(user, businessId, 'MANAGER');
  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, businessId: context.businessId }, select: { id: true, phone: true } });
    if (!customer) throw new ValidationError('That customer was not found.');
    await tx.customerOrder.updateMany({
      where: { businessId: context.businessId, OR: [{ customerId: customer.id }, { customerPhone: customer.phone }] },
      data: { customerName: null, customerPhone: null, customerId: null },
    });
    await tx.customer.delete({ where: { id: customer.id } });
  });
  await recordAudit({ action: 'customer.forgotten', entity: 'customer', entityId: customerId, businessId: context.businessId, userId: user.id });
}

/**
 * Customers as a CSV file Excel opens with Arabic intact (UTF-8 with a byte
 * order mark). "subscribers" is the list to send offers to; "all" includes
 * customers who ordered but did not ask for offers, for follow-up only.
 */
export async function exportCustomersCsv(
  user: AuthenticatedUser,
  businessId: string,
  scope: 'subscribers' | 'all',
): Promise<{ fileName: string; body: string; count: number }> {
  const context = await requireTenantContext(user, businessId, 'MANAGER');
  const [business, rows] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: context.businessId }, select: { slug: true, currency: true } }),
    prisma.customer.findMany({
      where: { businessId: context.businessId, ...(scope === 'subscribers' ? { marketingOptIn: true } : {}) },
      orderBy: { createdAt: 'asc' },
      select: { name: true, phone: true, orderCount: true, totalSpentMinor: true, lastOrderAt: true, marketingOptIn: true, optInAt: true, optInSource: true, createdAt: true },
    }),
  ]);
  const digits = minorUnitDigits(business.currency);
  const header = ['name', 'phone', 'whatsapp', 'orders', `total_spent_${business.currency}`, 'last_order', 'accepts_offers', 'offers_since', 'signed_up_from', 'first_seen'];
  const lines = rows.map((row) =>
    [
      row.name,
      // Grouped with a space so Excel keeps it as text, not 9.66E+11.
      `${row.phone.slice(0, 3)} ${row.phone.slice(3)}`,
      whatsappChatLink(row.phone),
      row.orderCount,
      (Number(row.totalSpentMinor) / 10 ** digits).toFixed(digits),
      row.lastOrderAt?.toISOString().slice(0, 10) ?? '',
      row.marketingOptIn ? 'yes' : 'no',
      row.optInAt?.toISOString().slice(0, 10) ?? '',
      row.optInSource ?? '',
      row.createdAt.toISOString().slice(0, 10),
    ]
      .map(csvCell)
      .join(','),
  );

  await recordAudit({
    action: 'customers.exported',
    entity: 'business',
    entityId: context.businessId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { scope, count: rows.length },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    fileName: `${business.slug}-${scope === 'subscribers' ? 'offers-list' : 'customers'}-${stamp}.csv`,
    body: `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`,
    count: rows.length,
  };
}
