import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { createBusiness } from '@/server/admin/business-service';
import { TenantAccessError } from '@/server/tenancy/context';
import { resetEnvCache } from '@/lib/env';
import { createDish } from '@/server/menu-manage/service';
import { recordMenuOrder, subscribeToOffers } from '@/server/customers/record';
import {
  exportCustomersCsv,
  forgetCustomer,
  getCustomerDashboard,
  listCustomers,
  optOutCustomer,
  setOffersSignup,
  setOrderStatus,
} from '@/server/customers/admin';
import { resolveDatabase } from '../database';

/**
 * Orders sent from a menu and the customers behind them: what is recorded,
 * what is refused, consent for offers, and who may see phone numbers.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
const prisma = new PrismaClient({ adapter });
const databaseReachable = await resolveDatabase(() => prisma.$queryRaw`SELECT 1`);

const SLUG = 'customers-fixture';
const OTHER_SLUG = 'customers-other';
const EMAILS = ['customers-owner@example.test', 'customers-editor@example.test', 'customers-stranger@example.test'];

let owner = { id: '', role: 'SUPER_ADMIN' as const };
let editor = { id: '', role: 'STAFF' as const };
let stranger = { id: '', role: 'STAFF' as const };
let businessId = '';
let publicId = '';
let otherPublicId = '';
let otherBusinessId = '';
let shawarma = '';
let juice = '';

async function removeFixture() {
  await prisma.business.deleteMany({ where: { slug: { in: [SLUG, OTHER_SLUG] } } });
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
}

async function makeBusiness(slug: string, nameAr: string) {
  return createBusiness(owner, {
    slug,
    type: 'RESTAURANT',
    status: 'ACTIVE',
    defaultLocale: 'ar',
    currency: 'SAR',
    nameAr,
    nameEn: slug,
  } as Parameters<typeof createBusiness>[1]);
}

async function codeOf(id: string) {
  return (await prisma.menuItem.findUniqueOrThrow({ where: { id }, select: { itemCode: true } })).itemCode;
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    orderType: 'takeaway',
    name: 'أحمد',
    phone: '0551234567',
    items: [
      { code: shawarma, qty: 2, total: 24 },
      { code: juice, qty: 1, total: 9.5 },
    ],
    ...overrides,
  };
}

beforeAll(async () => {
  process.env.PUBLIC_URL = 'https://menu.example.com';
  resetEnvCache();
  if (!databaseReachable) return;
  await removeFixture();
  owner = { id: (await prisma.user.create({ data: { email: EMAILS[0]!, name: 'Owner', role: 'SUPER_ADMIN' } })).id, role: 'SUPER_ADMIN' };
  editor = { id: (await prisma.user.create({ data: { email: EMAILS[1]!, name: 'Editor', role: 'STAFF' } })).id, role: 'STAFF' };
  stranger = { id: (await prisma.user.create({ data: { email: EMAILS[2]!, name: 'Stranger', role: 'STAFF' } })).id, role: 'STAFF' };

  const business = await makeBusiness(SLUG, 'مطعم العملاء');
  businessId = business.id;
  publicId = business.publicId;
  const other = await makeBusiness(OTHER_SLUG, 'مطعم آخر');
  otherBusinessId = other.id;
  otherPublicId = other.publicId;
  await prisma.businessMembership.create({ data: { userId: editor.id, businessId, role: 'EDITOR' } });

  shawarma = await codeOf((await createDish(owner, businessId, { newSection: 'المشويات', nameAr: 'شاورما', price: '12' })).id);
  juice = await codeOf((await createDish(owner, businessId, { newSection: 'المشروبات', nameAr: 'عصير', price: '9.5' })).id);
  await createDish(owner, otherBusinessId, { newSection: 'قسم', nameAr: 'طبقهم', price: '5' });
});

afterAll(async () => {
  if (databaseReachable) await removeFixture();
  await prisma.$disconnect();
});

beforeEach(async () => {
  if (!databaseReachable) return;
  await prisma.customerOrder.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } });
  await prisma.customer.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } });
  await prisma.business.updateMany({ where: { id: { in: [businessId, otherBusinessId] } }, data: { offersSignupEnabled: false, status: 'ACTIVE' } });
});

const run = databaseReachable ? describe : describe.skip;

run('recording an order sent from the menu', () => {
  it('keeps the order, its lines and totals, and the customer by one phone number', async () => {
    const id = await recordMenuOrder(publicId, order());
    expect(id).not.toBeNull();
    const saved = await prisma.customerOrder.findUniqueOrThrow({ where: { id: id! }, include: { items: true, customer: true } });
    expect(saved).toMatchObject({ orderType: 'takeaway', customerName: 'أحمد', customerPhone: '966551234567', subtotalMinor: 3350, totalMinor: 3350, itemCount: 3, status: 'SENT' });
    expect(saved.items.map((line) => [line.nameAr, line.quantity, line.lineTotalMinor]).sort()).toEqual([['شاورما', 2, 2400], ['عصير', 1, 950]]);
    expect(saved.customer).toMatchObject({ phone: '966551234567', orderCount: 1, totalSpentMinor: 3350, marketingOptIn: false });

    // The same person typing the number differently is the same customer.
    await recordMenuOrder(publicId, order({ phone: '+966 55 123 4567', items: [{ code: juice, qty: 1, total: 9.5 }] }));
    const customer = await prisma.customer.findUniqueOrThrow({ where: { businessId_phone: { businessId, phone: '966551234567' } } });
    expect(customer).toMatchObject({ orderCount: 2, totalSpentMinor: 4300 });
  });

  it('drops dishes the restaurant does not have, and adds a delivery fee only to delivery', async () => {
    const id = await recordMenuOrder(publicId, order({
      orderType: 'delivery',
      deliveryFee: 7,
      items: [{ code: shawarma, qty: 1, total: 12 }, { code: 'NOT-A-DISH', qty: 1, total: 500 }, { code: juice, qty: 0, total: 9 }],
    }));
    const saved = await prisma.customerOrder.findUniqueOrThrow({ where: { id: id! } });
    expect(saved).toMatchObject({ subtotalMinor: 1200, deliveryFeeMinor: 700, totalMinor: 1900, itemCount: 1 });

    const takeaway = await recordMenuOrder(publicId, order({ deliveryFee: 7 }));
    expect((await prisma.customerOrder.findUniqueOrThrow({ where: { id: takeaway! } })).deliveryFeeMinor).toBe(0);
  });

  it('records nothing for an unknown order type, no known dishes, another restaurant’s dishes, or an inactive restaurant', async () => {
    expect(await recordMenuOrder(publicId, order({ orderType: 'pickup' }))).toBeNull();
    expect(await recordMenuOrder(publicId, order({ items: [{ code: 'NOPE', qty: 1, total: 1 }] }))).toBeNull();
    expect(await recordMenuOrder(otherPublicId, order())).toBeNull();
    await prisma.business.update({ where: { id: businessId }, data: { status: 'DRAFT' } });
    expect(await recordMenuOrder(publicId, order())).toBeNull();
    expect(await prisma.customerOrder.count({ where: { businessId: { in: [businessId, otherBusinessId] } } })).toBe(0);
  });

  it('an order without a phone is kept without a customer', async () => {
    const id = await recordMenuOrder(publicId, order({ phone: '', name: '' }));
    expect(await prisma.customerOrder.findUniqueOrThrow({ where: { id: id! } })).toMatchObject({ customerId: null, customerPhone: null, customerName: null });
    expect(await prisma.customer.count({ where: { businessId } })).toBe(0);
  });
});

run('consent for offers', () => {
  it('the cart’s box adds a customer to the offers list only when the restaurant collects sign-ups', async () => {
    await recordMenuOrder(publicId, order({ offers: true }));
    expect((await prisma.customer.findFirstOrThrow({ where: { businessId } })).marketingOptIn).toBe(false);

    await setOffersSignup(owner, businessId, true);
    await recordMenuOrder(publicId, order({ offers: true }));
    expect(await prisma.customer.findFirstOrThrow({ where: { businessId } })).toMatchObject({ marketingOptIn: true, optInSource: 'cart' });
  });

  it('sign-up from the menu needs sign-up turned on and a real number; opting out is kept until they sign up again', async () => {
    expect(await subscribeToOffers(publicId, { name: 'سارة', phone: '0559876543' })).toBe(false);
    await setOffersSignup(owner, businessId, true);
    expect(await subscribeToOffers(publicId, { name: 'سارة', phone: 'not a number' })).toBe(false);
    expect(await subscribeToOffers(publicId, { name: 'سارة', phone: '0559876543' })).toBe(true);

    const customer = await prisma.customer.findFirstOrThrow({ where: { businessId, phone: '966559876543' } });
    expect(customer).toMatchObject({ name: 'سارة', marketingOptIn: true, optInSource: 'signup', orderCount: 0 });

    await optOutCustomer(owner, businessId, customer.id);
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({ marketingOptIn: false });
    // An order without the box ticked does not sign them back up.
    await recordMenuOrder(publicId, order({ phone: '0559876543' }));
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).marketingOptIn).toBe(false);

    expect(await subscribeToOffers(publicId, { phone: '0559876543' })).toBe(true);
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({ marketingOptIn: true, optOutAt: null });
  });
});

run('the restaurant’s dashboard', () => {
  it('counts orders, value, top dishes and returning customers, without cancelled orders or other restaurants', async () => {
    const first = await recordMenuOrder(publicId, order());
    await recordMenuOrder(publicId, order({ items: [{ code: shawarma, qty: 3, total: 36 }] }));
    await recordMenuOrder(publicId, order({ phone: '0500000001', items: [{ code: juice, qty: 1, total: 9.5 }] }));
    const cancelled = await recordMenuOrder(publicId, order({ phone: '0500000002', items: [{ code: juice, qty: 10, total: 95 }] }));
    await setOrderStatus(owner, businessId, cancelled!, 'CANCELLED');
    await setOrderStatus(owner, businessId, first!, 'CONFIRMED');

    const data = await getCustomerDashboard(owner, businessId, 30);
    expect(data.totals).toMatchObject({ orders: 3, cancelled: 1, salesMinor: 3350 + 3600 + 950, customers: 2, returningCustomers: 1 });
    expect(data.totals.averageMinor).toBe(Math.round((3350 + 3600 + 950) / 3));
    expect(data.topDishes[0]).toMatchObject({ code: shawarma, nameAr: 'شاورما', quantity: 5, salesMinor: 6000 });
    expect(data.topDishes.find((dish) => dish.code === juice)).toMatchObject({ quantity: 2 });
    expect(data.byDay.reduce((sum, day) => sum + day.orders, 0)).toBe(3);
    expect(data.byHour.reduce((sum, hour) => sum + hour.orders, 0)).toBe(3);
    expect(data.recentOrders).toHaveLength(4);

    // A cancelled order leaves its customer's totals, and comes back if un-cancelled.
    const cancelledCustomer = await prisma.customer.findFirstOrThrow({ where: { businessId, phone: '966500000002' } });
    expect(cancelledCustomer).toMatchObject({ orderCount: 0, totalSpentMinor: 0 });
    await setOrderStatus(owner, businessId, cancelled!, 'SENT');
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: cancelledCustomer.id } })).toMatchObject({ orderCount: 1, totalSpentMinor: 9500 });
  });

  it('phone numbers are for a manager or the owner: an editor and a stranger are refused', async () => {
    await recordMenuOrder(publicId, order());
    for (const user of [editor, stranger]) {
      await expect(getCustomerDashboard(user, businessId, 30)).rejects.toBeInstanceOf(TenantAccessError);
      await expect(listCustomers(user, businessId)).rejects.toBeInstanceOf(TenantAccessError);
      await expect(exportCustomersCsv(user, businessId, 'all')).rejects.toBeInstanceOf(TenantAccessError);
    }
  });

  it('cannot change another restaurant’s order or customer', async () => {
    await setOffersSignup(owner, otherBusinessId, true);
    await subscribeToOffers(otherPublicId, { phone: '0551112222' });
    const theirs = await prisma.customer.findFirstOrThrow({ where: { businessId: otherBusinessId } });
    await expect(optOutCustomer(owner, businessId, theirs.id)).rejects.toThrow();
    await expect(forgetCustomer(owner, businessId, theirs.id)).rejects.toThrow();
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ marketingOptIn: true });
  });
});

run('exports and erasure', () => {
  it('the offers list holds only customers who agreed, opens safely in Excel, and every export is audited', async () => {
    await setOffersSignup(owner, businessId, true);
    await subscribeToOffers(publicId, { name: '=HYPERLINK("http://x")', phone: '0551230000' });
    await recordMenuOrder(publicId, order({ phone: '0559990000' }));

    const offers = await exportCustomersCsv(owner, businessId, 'subscribers');
    expect(offers.count).toBe(1);
    expect(offers.body.startsWith('﻿name,phone,whatsapp')).toBe(true);
    expect(offers.body).toContain(`"'=HYPERLINK(""http://x"")",966 551230000,https://wa.me/966551230000`);
    expect(offers.body).not.toContain('559990000');

    const all = await exportCustomersCsv(owner, businessId, 'all');
    expect(all.count).toBe(2);
    expect(await prisma.auditLog.count({ where: { businessId, action: 'customers.exported' } })).toBeGreaterThanOrEqual(2);
  });

  it('deleting a customer’s data removes their name and number from their orders, and keeps the totals', async () => {
    const id = await recordMenuOrder(publicId, order());
    const customer = await prisma.customer.findFirstOrThrow({ where: { businessId } });
    await forgetCustomer(owner, businessId, customer.id);

    expect(await prisma.customer.count({ where: { id: customer.id } })).toBe(0);
    expect(await prisma.customerOrder.findUniqueOrThrow({ where: { id: id! } })).toMatchObject({ customerName: null, customerPhone: null, customerId: null, totalMinor: 3350 });
    expect((await getCustomerDashboard(owner, businessId, 30)).totals).toMatchObject({ orders: 1, salesMinor: 3350, customers: 0 });
  });
});
