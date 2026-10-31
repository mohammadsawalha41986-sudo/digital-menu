import { prisma } from '@/server/db/client';
import { requireTenantContext, type AuthenticatedUser } from '@/server/tenancy/context';
import { recordAudit } from '@/server/audit/log';
import { ValidationError } from '@/server/admin/business-service';
import { parsePriceToMinor } from '@/lib/money';

/**
 * Modifiers and add-ons (Menu Studio §10, §11).
 *
 * Groups are business-level and shared by reference, so editing "Milk" edits
 * it everywhere it is offered. Options hold a price *delta*: a stored absolute
 * would silently go stale the next time the base price moves, which is exactly
 * the kind of quiet wrongness a menu cannot afford.
 */

export interface ModifierOptionInput {
  key: string;
  nameAr: string;
  nameEn?: string | null;
  priceDeltaMinor?: number;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ModifierGroupInput {
  key: string;
  nameAr: string;
  nameEn?: string | null;
  minSelect?: number;
  maxSelect?: number;
  sortOrder?: number;
  isActive?: boolean;
  options: ModifierOptionInput[];
}

function assertBounds(input: ModifierGroupInput) {
  const min = input.minSelect ?? 0;
  const max = input.maxSelect ?? 1;

  if (min < 0) throw new ValidationError('The minimum number of choices cannot be negative.');
  if (max < 1) throw new ValidationError('A group must allow at least one choice.');
  if (min > max) throw new ValidationError('The minimum cannot exceed the maximum.');
  if (input.options.length === 0) throw new ValidationError('A modifier group needs at least one option.');
  if (min > input.options.length) {
    throw new ValidationError('The minimum cannot exceed the number of options offered.');
  }

  const keys = input.options.map((option) => option.key);
  if (new Set(keys).size !== keys.length) {
    throw new ValidationError('Two options in the same group share a key.');
  }

  // More defaults than the group permits is a configuration that can never be
  // satisfied; better to refuse it than to render a broken choice.
  const defaults = input.options.filter((option) => option.isDefault).length;
  if (defaults > max) {
    throw new ValidationError('More options are marked default than the group allows to be chosen.');
  }
}

export async function listModifierGroups(user: AuthenticatedUser, businessId: string) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  return prisma.modifierGroup.findMany({
    where: { businessId: context.businessId },
    orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    include: { options: { orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] } },
  });
}

/**
 * Creates or replaces a group and its options in one transaction.
 *
 * Replacing options wholesale rather than diffing them keeps the stored set
 * exactly what the operator submitted; a half-applied group is worse than a
 * rejected one.
 */
export async function saveModifierGroup(
  user: AuthenticatedUser,
  businessId: string,
  input: ModifierGroupInput,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  assertBounds(input);

  const existing = await prisma.modifierGroup.findFirst({
    where: { businessId: context.businessId, key: input.key },
    select: { id: true },
  });

  const group = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.modifierGroup.update({
          where: { id: existing.id },
          data: {
            nameAr: input.nameAr,
            nameEn: input.nameEn ?? null,
            minSelect: input.minSelect ?? 0,
            maxSelect: input.maxSelect ?? 1,
            sortOrder: input.sortOrder ?? 0,
            isActive: input.isActive ?? true,
          },
        })
      : await tx.modifierGroup.create({
          data: {
            businessId: context.businessId,
            key: input.key,
            nameAr: input.nameAr,
            nameEn: input.nameEn ?? null,
            minSelect: input.minSelect ?? 0,
            maxSelect: input.maxSelect ?? 1,
            sortOrder: input.sortOrder ?? 0,
            isActive: input.isActive ?? true,
          },
        });

    await tx.modifierOption.deleteMany({ where: { groupId: saved.id } });
    await tx.modifierOption.createMany({
      data: input.options.map((option, index) => ({
        groupId: saved.id,
        businessId: context.businessId,
        key: option.key,
        nameAr: option.nameAr,
        nameEn: option.nameEn ?? null,
        priceDeltaMinor: option.priceDeltaMinor ?? 0,
        isDefault: option.isDefault ?? false,
        isActive: option.isActive ?? true,
        sortOrder: option.sortOrder ?? index,
      })),
    });

    return saved;
  });

  await recordAudit({
    action: existing ? 'modifier_group.updated' : 'modifier_group.created',
    entity: 'modifier_group',
    entityId: group.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { key: input.key, options: input.options.length },
  });

  return group;
}

export async function deleteModifierGroup(
  user: AuthenticatedUser,
  businessId: string,
  key: string,
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const { count } = await prisma.modifierGroup.deleteMany({
    where: { businessId: context.businessId, key },
  });

  if (count === 0) throw new ValidationError('That modifier group does not exist.');

  await recordAudit({
    action: 'modifier_group.deleted',
    entity: 'modifier_group',
    businessId: context.businessId,
    userId: user.id,
    metadata: { key },
  });
}

/**
 * Sets which groups an item offers.
 *
 * Both the item and every group are resolved inside the tenant scope first: a
 * group id from another business matches nothing, so one restaurant's "Extras"
 * can never appear on another's menu (§32).
 */
export async function setItemModifiers(
  user: AuthenticatedUser,
  businessId: string,
  itemCode: string,
  groupKeys: string[],
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const item = await prisma.menuItem.findFirst({
    where: { businessId: context.businessId, itemCode },
    select: { id: true },
  });

  if (!item) throw new ValidationError('That item does not exist.');

  const groups = await prisma.modifierGroup.findMany({
    where: { businessId: context.businessId, key: { in: groupKeys } },
    select: { id: true, key: true },
  });

  const missing = groupKeys.filter((key) => !groups.some((group) => group.key === key));
  if (missing.length > 0) {
    throw new ValidationError(`No modifier group with the key ${missing.join(', ')}.`);
  }

  const ordered = groupKeys.map((key) => groups.find((group) => group.key === key)!);

  await prisma.$transaction([
    prisma.menuItemModifierGroup.deleteMany({ where: { itemId: item.id } }),
    prisma.menuItemModifierGroup.createMany({
      data: ordered.map((group, index) => ({
        itemId: item.id,
        groupId: group.id,
        businessId: context.businessId,
        sortOrder: index,
      })),
    }),
  ]);

  await recordAudit({
    action: 'item.modifiers_changed',
    entity: 'menu_item',
    entityId: item.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { itemCode, groups: groupKeys },
  });
}

export interface ResolvedModifierGroup {
  key: string;
  nameAr: string;
  nameEn: string | null;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: {
    key: string;
    nameAr: string;
    nameEn: string | null;
    priceDeltaMinor: number;
    isDefault: boolean;
  }[];
}

/** What a public menu shows: active groups and active options only. */
export async function getItemModifiers(
  businessId: string,
  itemId: string,
): Promise<ResolvedModifierGroup[]> {
  const links = await prisma.menuItemModifierGroup.findMany({
    where: { itemId, businessId, group: { isActive: true } },
    orderBy: { sortOrder: 'asc' },
    include: {
      group: {
        include: { options: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
      },
    },
  });

  return links.map(({ group }) => ({
    key: group.key,
    nameAr: group.nameAr,
    nameEn: group.nameEn,
    required: group.minSelect > 0,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    options: group.options.map((option) => ({
      key: option.key,
      nameAr: option.nameAr,
      nameEn: option.nameEn,
      priceDeltaMinor: option.priceDeltaMinor,
      isDefault: option.isDefault,
    })),
  }));
}

/**
 * Offers one group on exactly these dishes (by item code): added where it is
 * missing, removed where it is no longer wanted. The other groups a dish
 * offers are left as they are.
 */
export async function setModifierGroupItems(
  user: AuthenticatedUser,
  businessId: string,
  groupKey: string,
  itemCodes: string[],
) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  const group = await prisma.modifierGroup.findFirst({
    where: { businessId: context.businessId, key: groupKey },
    select: { id: true, sortOrder: true },
  });
  if (!group) throw new ValidationError('That modifier group does not exist.');

  const codes = Array.from(new Set(itemCodes.map((code) => code.trim().toUpperCase()).filter(Boolean)));
  const items = await prisma.menuItem.findMany({
    where: { businessId: context.businessId, itemCode: { in: codes } },
    select: { id: true, itemCode: true },
  });
  const unknown = codes.filter((code) => !items.some((item) => item.itemCode === code));
  if (unknown.length > 0) throw new ValidationError(`No dish with code ${unknown.join(', ')}`);

  const ids = items.map((item) => item.id);
  const linked = await prisma.menuItemModifierGroup.findMany({
    where: { groupId: group.id },
    select: { itemId: true },
  });
  const toAdd = ids.filter((id) => !linked.some((link) => link.itemId === id));

  await prisma.$transaction([
    prisma.menuItemModifierGroup.deleteMany({ where: { groupId: group.id, itemId: { notIn: ids } } }),
    prisma.menuItemModifierGroup.createMany({
      data: toAdd.map((itemId) => ({
        itemId,
        groupId: group.id,
        businessId: context.businessId,
        sortOrder: group.sortOrder,
      })),
    }),
  ]);

  await recordAudit({
    action: 'item.modifiers_changed',
    entity: 'modifier_group',
    entityId: group.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { groupKey, items: codes },
  });

  return codes.length;
}

/** A group as the options page edits it: prices as typed, dishes by code. */
export interface OptionGroupForm {
  /** Absent for a new group; kept on edit so carts and links stay valid. */
  key?: string;
  nameAr: string;
  nameEn?: string;
  required: boolean;
  /** How many options a customer may pick; 1 is a single choice. */
  max: number;
  options: { key?: string; nameAr: string; nameEn?: string; price: string; isDefault: boolean }[];
  items: string[];
}

const newKey = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Saves a group from the options page and offers it on the chosen dishes.
 * Prices are read in the restaurant's own currency (three decimals for KWD).
 */
export async function saveOptionGroup(user: AuthenticatedUser, businessId: string, form: OptionGroupForm) {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: context.businessId },
    select: { currency: true },
  });

  const nameAr = form.nameAr.trim();
  if (!nameAr) throw new ValidationError('Give the group a name.');
  const max = Math.trunc(Number(form.max));
  if (!Number.isFinite(max) || max < 1) throw new ValidationError('A group must allow at least one choice.');

  const options = form.options
    .filter((option) => option.nameAr.trim() !== '')
    .map((option, index) => {
      const price = option.price.trim() === '' ? 0 : parsePriceToMinor(option.price, business.currency);
      if (price === null) {
        throw new ValidationError(`The price of “${option.nameAr.trim()}” is not a number.`);
      }
      return {
        key: option.key || newKey('o'),
        nameAr: option.nameAr.trim(),
        nameEn: option.nameEn?.trim() || null,
        priceDeltaMinor: price,
        isDefault: option.isDefault,
        sortOrder: index,
      };
    });

  const key = form.key || newKey('g');
  await saveModifierGroup(user, businessId, {
    key,
    nameAr,
    nameEn: form.nameEn?.trim() || null,
    minSelect: form.required ? 1 : 0,
    maxSelect: Math.min(max, Math.max(options.length, 1)),
    options,
  });
  await setModifierGroupItems(user, businessId, key, form.items);
  return key;
}

/** Every group with its options and the dishes (item codes) it is on. */
export async function listOptionGroups(user: AuthenticatedUser, businessId: string) {
  const context = await requireTenantContext(user, businessId, 'VIEWER');
  return prisma.modifierGroup.findMany({
    where: { businessId: context.businessId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      options: { orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] },
      items: { select: { item: { select: { itemCode: true } } } },
    },
  });
}
