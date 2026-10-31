import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { requireTenantContext, type AuthenticatedUser } from '@/server/tenancy/context';
import { ValidationError } from './business-service';
import { parsePriceToMinor } from '@/lib/money';
import { parseLocalDateTime } from '@/server/offers/datetime';
import { parseWorkingHours } from '@/server/business/hours';
import {
  discountState,
  isDiscountMode,
  parsePercent,
  isOfferSort,
  percentOff,
  salePrice,
  type DiscountMode,
  type DiscountState,
  type OfferSort,
} from '@/lib/discount';

/**
 * Dish discounts, as the restaurant manages them. A discount lives on the
 * dish itself: switching it on is all it takes for the dish to appear in the
 * menu's offers section while the window is open, and nothing is copied.
 */

const DEFAULT_ZONE = 'Asia/Riyadh';

export interface DiscountForm {
  itemCode: string;
  enabled: boolean;
  mode: string;
  /** As typed: "20" for a percent, "9" or "36.50" for an amount or price. */
  value: string;
  /** `datetime-local` values in the restaurant's own zone; empty is open. */
  startsAt?: string;
  endsAt?: string;
  branchKeys?: string[];
}

async function zoneOf(businessId: string) {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { currency: true, workingHours: true },
  });
  return {
    currency: business.currency,
    zone: parseWorkingHours(business.workingHours)?.timezone ?? DEFAULT_ZONE,
  };
}

/** Reads a typed discount into a stored one, refusing anything that is not a real discount. */
function readRule(form: DiscountForm, currency: string, zone: string, priceMinor: number | null, branchKeys: string[]) {
  if (!isDiscountMode(form.mode)) throw new ValidationError('Choose how the discount is given.');
  const mode: DiscountMode = form.mode;
  const typed = form.value.trim();
  let value: number | null;
  if (mode === 'PERCENT') {
    value = parsePercent(typed);
    if (value === null || value < 1 || value > 95) throw new ValidationError('The percentage must be a whole number from 1 to 95.');
  } else {
    value = parsePriceToMinor(typed, currency);
    if (value === null || value <= 0) throw new ValidationError('Enter the amount as a price, e.g. 9 or 36.50.');
  }

  if (priceMinor === null || priceMinor <= 0) throw new ValidationError('The dish needs a price before it can be discounted.');
  if (salePrice(priceMinor, mode, value) === null) {
    throw new ValidationError(
      mode === 'PRICE'
        ? 'The price after the discount must be above zero and below the original price.'
        : 'The discount would take the price to zero or below.',
    );
  }

  const startsAt = parseLocalDateTime(form.startsAt?.trim() || null, zone);
  const endsAt = parseLocalDateTime(form.endsAt?.trim() || null, zone);
  if (form.startsAt?.trim() && !startsAt) throw new ValidationError('The start date could not be read.');
  if (form.endsAt?.trim() && !endsAt) throw new ValidationError('The end date could not be read.');
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new ValidationError('The discount would end before it starts.');
  }

  const chosen = Array.from(new Set((form.branchKeys ?? []).map((key) => key.trim()).filter(Boolean)));
  const unknown = chosen.filter((key) => !branchKeys.includes(key));
  if (unknown.length > 0) throw new ValidationError(`No branch ${unknown.join(', ')}.`);

  return { mode, value, startsAt, endsAt, branchKeys: chosen };
}

/** Saves one dish's discount. Switching it off keeps the settings for next time. */
export async function saveDiscount(user: AuthenticatedUser, businessId: string, form: DiscountForm) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const item = await prisma.menuItem.findFirst({
    where: { businessId: context.businessId, itemCode: form.itemCode.trim().toUpperCase() },
    select: { id: true, itemCode: true, priceMinor: true, discountEnabled: true },
  });
  if (!item) throw new ValidationError('That dish does not exist.');

  let data;
  if (!form.enabled && !form.value.trim()) {
    data = { discountEnabled: false, discountUpdatedAt: new Date() };
  } else {
    const { currency, zone } = await zoneOf(context.businessId);
    const branches = await prisma.branch.findMany({ where: { businessId: context.businessId }, select: { key: true } });
    const rule = readRule(form, currency, zone, item.priceMinor, branches.map((branch) => branch.key));
    data = {
      discountEnabled: form.enabled,
      discountMode: rule.mode,
      discountValue: rule.value,
      discountStartsAt: rule.startsAt,
      discountEndsAt: rule.endsAt,
      discountBranchKeys: rule.branchKeys,
      discountUpdatedAt: new Date(),
    };
  }

  const saved = await prisma.menuItem.update({ where: { id: item.id }, data });
  await recordAudit({
    action: 'item.discount_changed',
    entity: 'menu_item',
    entityId: item.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: {
      itemCode: item.itemCode,
      enabled: saved.discountEnabled,
      mode: saved.discountMode,
      value: saved.discountValue,
      startsAt: saved.discountStartsAt?.toISOString() ?? null,
      endsAt: saved.discountEndsAt?.toISOString() ?? null,
      branches: saved.discountBranchKeys,
    },
  });
  return saved;
}

/** The quick switch in the list: on keeps the stored settings, which must still be a real discount. */
export async function setDiscountEnabled(user: AuthenticatedUser, businessId: string, itemCode: string, enabled: boolean) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const item = await prisma.menuItem.findFirst({
    where: { businessId: context.businessId, itemCode: itemCode.trim().toUpperCase() },
    select: { id: true, itemCode: true, priceMinor: true, discountMode: true, discountValue: true },
  });
  if (!item) throw new ValidationError('That dish does not exist.');
  if (enabled && salePrice(item.priceMinor, isDiscountMode(item.discountMode) ? item.discountMode : null, item.discountValue) === null) {
    throw new ValidationError('Set the discount first: it does not give a price below the current one.');
  }
  await prisma.menuItem.update({ where: { id: item.id }, data: { discountEnabled: enabled, discountUpdatedAt: new Date() } });
  await recordAudit({
    action: 'item.discount_changed',
    entity: 'menu_item',
    entityId: item.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { itemCode: item.itemCode, enabled },
  });
}

/**
 * One discount on many dishes at once. Every dish is checked first; if any
 * would end at or below zero or above its price, nothing is saved.
 */
export async function applyDiscountToMany(
  user: AuthenticatedUser,
  businessId: string,
  itemCodes: string[],
  form: Omit<DiscountForm, 'itemCode'>,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const codes = Array.from(new Set(itemCodes.map((code) => code.trim().toUpperCase()).filter(Boolean)));
  if (codes.length === 0) throw new ValidationError('Choose at least one dish.');
  const items = await prisma.menuItem.findMany({
    where: { businessId: context.businessId, itemCode: { in: codes } },
    select: { id: true, itemCode: true, nameAr: true, priceMinor: true },
  });
  const unknown = codes.filter((code) => !items.some((item) => item.itemCode === code));
  if (unknown.length > 0) throw new ValidationError(`No dish with code ${unknown.join(', ')}.`);

  const { currency, zone } = await zoneOf(context.businessId);
  const branches = (await prisma.branch.findMany({ where: { businessId: context.businessId }, select: { key: true } })).map((b) => b.key);
  const rules = items.map((item) => {
    try {
      return { item, rule: readRule({ ...form, itemCode: item.itemCode }, currency, zone, item.priceMinor, branches) };
    } catch (error) {
      if (error instanceof ValidationError) throw new ValidationError(`«${item.nameAr}»: ${error.message}`);
      throw error;
    }
  });

  const now = new Date();
  await prisma.$transaction(
    rules.map(({ item, rule }) =>
      prisma.menuItem.update({
        where: { id: item.id },
        data: {
          discountEnabled: form.enabled,
          discountMode: rule.mode,
          discountValue: rule.value,
          discountStartsAt: rule.startsAt,
          discountEndsAt: rule.endsAt,
          discountBranchKeys: rule.branchKeys,
          discountUpdatedAt: now,
        },
      }),
    ),
  );
  await recordAudit({
    action: 'item.discount_changed',
    entity: 'business',
    entityId: context.businessId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { items: codes, enabled: form.enabled, mode: form.mode, value: form.value, bulk: true },
  });
  return codes.length;
}

/** How the offers section is ordered, and whether a percentage also reduces add-ons. */
export async function saveOffersSettings(
  user: AuthenticatedUser,
  businessId: string,
  settings: { sort: string; includesOptions: boolean; manualOrder?: string[] },
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  if (!isOfferSort(settings.sort)) throw new ValidationError('Choose how offers are ordered.');
  const sort: OfferSort = settings.sort;
  const order = (settings.manualOrder ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean);
  const items = order.length
    ? await prisma.menuItem.findMany({ where: { businessId: context.businessId, itemCode: { in: order } }, select: { id: true, itemCode: true } })
    : [];

  await prisma.$transaction([
    prisma.business.update({
      where: { id: context.businessId },
      data: { offersSort: sort, discountIncludesOptions: settings.includesOptions },
    }),
    ...items.map((item) =>
      prisma.menuItem.update({ where: { id: item.id }, data: { discountSortOrder: order.indexOf(item.itemCode) } }),
    ),
  ]);
  await recordAudit({
    action: 'offers.settings_changed',
    entity: 'business',
    entityId: context.businessId,
    businessId: context.businessId,
    userId: user.id,
    metadata: { sort, includesOptions: settings.includesOptions, manualOrder: order },
  });
}

export interface DiscountRow {
  itemCode: string;
  nameAr: string;
  section: string;
  priceMinor: number | null;
  enabled: boolean;
  mode: DiscountMode | null;
  value: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  branchKeys: string[];
  sortOrder: number;
  /** "none" when the dish has never had a discount set. */
  state: DiscountState | 'none';
  saleMinor: number | null;
  percent: number | null;
}

/** Every dish with its discount and where it stands now. */
export async function listDiscounts(user: AuthenticatedUser, businessId: string, now = new Date()) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');
  const [business, items, branches] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: context.businessId },
      select: { currency: true, offersSort: true, discountIncludesOptions: true, workingHours: true },
    }),
    prisma.menuItem.findMany({
      where: { businessId: context.businessId, availability: { not: 'HIDDEN' } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { itemCode: 'asc' }],
      select: {
        itemCode: true,
        nameAr: true,
        priceMinor: true,
        discountEnabled: true,
        discountMode: true,
        discountValue: true,
        discountStartsAt: true,
        discountEndsAt: true,
        discountBranchKeys: true,
        discountSortOrder: true,
        category: { select: { nameAr: true } },
      },
    }),
    prisma.branch.findMany({ where: { businessId: context.businessId }, orderBy: { sortOrder: 'asc' }, select: { key: true, nameAr: true } }),
  ]);

  const rows: DiscountRow[] = items.map((item) => {
    const mode = isDiscountMode(item.discountMode) ? item.discountMode : null;
    const sale = salePrice(item.priceMinor, mode, item.discountValue);
    return {
      itemCode: item.itemCode,
      nameAr: item.nameAr,
      section: item.category.nameAr,
      priceMinor: item.priceMinor,
      enabled: item.discountEnabled,
      mode,
      value: item.discountValue,
      startsAt: item.discountStartsAt,
      endsAt: item.discountEndsAt,
      branchKeys: item.discountBranchKeys,
      sortOrder: item.discountSortOrder,
      state:
        mode === null
          ? 'none'
          : discountState({ enabled: item.discountEnabled, startsAt: item.discountStartsAt, endsAt: item.discountEndsAt }, now),
      saleMinor: sale,
      percent: sale !== null && item.priceMinor ? percentOff(item.priceMinor, sale) : null,
    };
  });

  return {
    currency: business.currency,
    zone: parseWorkingHours(business.workingHours)?.timezone ?? DEFAULT_ZONE,
    sort: (isOfferSort(business.offersSort) ? business.offersSort : 'PERCENT') as OfferSort,
    includesOptions: business.discountIncludesOptions,
    branches,
    rows,
  };
}

/** The latest changes to discounts and offers settings, newest first. */
export async function listDiscountHistory(user: AuthenticatedUser, businessId: string, limit = 25) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');
  return prisma.auditLog.findMany({
    where: {
      businessId: context.businessId,
      action: { in: ['item.discount_changed', 'offers.settings_changed'] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, action: true, metadata: true, createdAt: true },
  });
}
