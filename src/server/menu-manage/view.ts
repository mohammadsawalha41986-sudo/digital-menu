import { prisma } from '@/server/db/client';
import { requireTenantContext, roleAtLeast, tenantScope, type AuthenticatedUser } from '@/server/tenancy/context';
import { listMedia } from '@/server/media/service';
import { listDeletedRecords, type DeletedRecordView } from './service';

/**
 * Everything the menu manager shows, loaded once. Roles are decided here as
 * well as in each action: a button the user cannot use is not drawn, and an
 * action the user cannot use refuses anyway.
 */

export interface DishRowView {
  id: string;
  itemCode: string;
  categoryId: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  priceMinor: number | null;
  availability: string;
  sortOrder: number;
  imageMediaId: string | null;
  imageUrl: string | null;
  choices: number;
  updatedAt: string;
}

export interface SectionView {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string | null;
  /** False when the section is hidden from the public menu. */
  visible: boolean;
  dishes: DishRowView[];
}

export interface MenuView {
  id: string;
  key: string;
  title: string;
  status: string;
  isLive: boolean;
  sections: SectionView[];
}

export interface ManageView {
  businessId: string;
  publicId: string;
  currency: string;
  canEdit: boolean;
  canManage: boolean;
  menus: MenuView[];
  media: { id: string; url: string; thumb: string; name: string; kind: string; contentType: string | null; usedBy: string[]; focalX: number | null; focalY: number | null }[];
  deleted: DeletedRecordView[];
}

export async function loadManageView(user: AuthenticatedUser, businessId: string): Promise<ManageView> {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const [business, menus, media, deleted] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: context.businessId }, select: { publicId: true, currency: true } }),
    prisma.menu.findMany({
      where: tenantScope(context),
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      select: {
        id: true,
        key: true,
        titleAr: true,
        titleEn: true,
        status: true,
        currentVersionId: true,
        categories: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            key: true,
            nameAr: true,
            nameEn: true,
            isActive: true,
            items: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                itemCode: true,
                categoryId: true,
                nameAr: true,
                nameEn: true,
                descriptionAr: true,
                descriptionEn: true,
                priceMinor: true,
                availability: true,
                sortOrder: true,
                imageMediaId: true,
                updatedAt: true,
                _count: { select: { modifiers: true } },
              },
            },
          },
        },
      },
    }),
    listMedia(user, context.businessId),
    listDeletedRecords(user, context.businessId),
  ]);

  const urlById = new Map(media.map((image) => [image.id, image.url] as const));

  const usedBy = new Map<string, string[]>();
  for (const menu of menus) {
    for (const category of menu.categories) {
      for (const item of category.items) {
        if (!item.imageMediaId) continue;
        const names = usedBy.get(item.imageMediaId) ?? [];
        names.push(item.nameAr);
        usedBy.set(item.imageMediaId, names);
      }
    }
  }

  return {
    businessId: context.businessId,
    publicId: business.publicId,
    currency: business.currency,
    canEdit: roleAtLeast(context.role, 'EDITOR'),
    canManage: roleAtLeast(context.role, 'MANAGER'),
    menus: menus.map((menu) => ({
      id: menu.id,
      key: menu.key,
      title: menu.titleEn ?? menu.titleAr,
      status: menu.status,
      isLive: menu.currentVersionId !== null,
      sections: menu.categories.map((category) => ({
        id: category.id,
        key: category.key,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        visible: category.isActive,
        dishes: category.items.map((item) => ({
          id: item.id,
          itemCode: item.itemCode,
          categoryId: item.categoryId,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          descriptionAr: item.descriptionAr,
          descriptionEn: item.descriptionEn,
          priceMinor: item.priceMinor,
          availability: item.availability,
          sortOrder: item.sortOrder,
          imageMediaId: item.imageMediaId,
          imageUrl: item.imageMediaId ? (urlById.get(item.imageMediaId) ?? null) : null,
          choices: item._count.modifiers,
          updatedAt: item.updatedAt.toISOString(),
        })),
      })),
    })),
    media: media
      .filter((image) => image.kind !== 'DOCUMENT' && image.contentType?.startsWith('image/') !== false)
      .map((image) => ({
        id: image.id,
        url: image.url,
        thumb: image.url,
        name: image.originalName ?? image.altAr ?? image.altEn ?? 'photo',
        kind: image.kind,
        contentType: image.contentType ?? null,
        usedBy: usedBy.get(image.id) ?? [],
        focalX: image.focalX ?? null,
        focalY: image.focalY ?? null,
      })),
    deleted,
  };
}
