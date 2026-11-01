import { prisma } from '@/server/db/client';
import { recordAudit } from '@/server/audit/log';
import { ValidationError } from '@/server/admin/business-service';
import { recordStaffUse, resolveStaffToken } from './service';
import { STATUS_MESSAGE, isStaffChangeable, isStaffStatus } from './rules';

export { STAFF_STATUSES, isStaffChangeable, isStaffStatus, type StaffStatus } from './rules';

export interface StaffSection {
  key: string;
  nameAr: string;
  nameEn: string;
  items: { itemCode: string; nameAr: string; nameEn: string; availability: string }[];
}

export interface StaffMenu {
  label: string;
  businessName: string;
  sections: StaffSection[];
}

/** The dishes of a restaurant as its staff see them, every state included. */
export async function loadStaffMenu(token: string): Promise<StaffMenu | null> {
  const link = await resolveStaffToken(token);
  if (!link) return null;

  const business = await prisma.business.findUnique({
    where: { id: link.businessId },
    select: {
      nameAr: true,
      nameEn: true,
      menus: {
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
        select: {
          categories: {
            orderBy: { sortOrder: 'asc' },
            select: {
              key: true,
              nameAr: true,
              nameEn: true,
              items: {
                orderBy: { sortOrder: 'asc' },
                select: { itemCode: true, nameAr: true, nameEn: true, availability: true },
              },
            },
          },
        },
      },
    },
  });

  if (!business) return null;

  const sections = business.menus.flatMap((menu) =>
    menu.categories
      .filter((category) => category.items.length > 0)
      .map((category) => ({
        key: category.key,
        nameAr: category.nameAr,
        nameEn: category.nameEn ?? category.nameAr,
        items: category.items.map((item) => ({
          itemCode: item.itemCode,
          nameAr: item.nameAr,
          nameEn: item.nameEn ?? item.nameAr,
          availability: item.availability,
        })),
      })),
  );

  return {
    label: link.label,
    businessName: business.nameEn ?? business.nameAr,
    sections,
  };
}

/**
 * Sets one dish's state, for the restaurant the link belongs to, and nothing
 * else. A dish of another restaurant is "not found" here, by design.
 *
 * Returns the message to show and the restaurant's public id. The caller
 * clears the public menu's cache with that id, as the other write paths do.
 */
export async function setStaffAvailability(
  token: string,
  itemCode: string,
  status: string,
): Promise<{ message: string; publicId: string }> {
  if (!isStaffStatus(status)) throw new ValidationError('Choose available, out right now, or hidden.');
  if (!itemCode.trim()) throw new ValidationError('Choose a dish first.');

  const link = await resolveStaffToken(token);
  if (!link) throw new ValidationError('This link is no longer valid. Ask the manager for a new one.');

  const item = await prisma.menuItem.findUnique({
    where: { businessId_itemCode: { businessId: link.businessId, itemCode } },
    select: { id: true, availability: true },
  });
  if (!item) throw new ValidationError('That dish is not on this menu.');
  if (!isStaffChangeable(item.availability)) {
    throw new ValidationError('Seasonal dishes are changed by the restaurant owner.');
  }

  if (item.availability !== status) {
    await prisma.menuItem.update({ where: { id: item.id }, data: { availability: status } });

    await recordAudit({
      action: 'item.availability_changed',
      entity: 'menu_item',
      entityId: item.id,
      businessId: link.businessId,
      metadata: {
        itemCode,
        from: item.availability,
        to: status,
        via: 'staff_link',
        staffLinkId: link.id,
      },
    });

  }

  await recordStaffUse(link.id);
  return { message: STATUS_MESSAGE[status], publicId: link.publicId };
}
