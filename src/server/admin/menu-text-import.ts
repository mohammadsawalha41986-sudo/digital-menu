import { prisma } from '@/server/db/client';
import { requireTenantContext, type AuthenticatedUser } from '@/server/tenancy/context';
import { parsePriceToMinor, formatMinorAsDecimal } from '@/lib/money';
import { parseMenuText, type TextProblem } from '@/lib/menu-text';
import { stableHash } from '@/lib/keys';
import { createCategory, createMenu, newItemCode, upsertItem } from './business-service';

/**
 * Step 5, the paste path: what a pasted menu will do (preview), and doing it
 * (save). Both read the same plan, so the preview is exactly what is saved.
 *
 * Sections and dishes are matched by name in the menu: pasting the same text
 * twice changes nothing the second time, and pasting a corrected price
 * updates that dish. A dish that already exists keeps everything the text
 * does not mention — its English name, photo, calories, availability.
 */

export interface PasteDishPlan {
  line: number;
  name: string;
  price: string;
  description: string | null;
  /** new: added; update: price or description changes; same: nothing to do. */
  status: 'new' | 'update' | 'same';
}

export interface PasteSectionPlan {
  name: string;
  isNew: boolean;
  dishes: PasteDishPlan[];
}

export interface PastePlan {
  sections: PasteSectionPlan[];
  problems: TextProblem[];
  counts: { new: number; update: number; same: number };
}

const fold = (value: string) => value.trim().replace(/\s+/g, ' ');

async function targetMenu(businessId: string) {
  return prisma.menu.findFirst({
    where: { businessId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      categories: {
        select: {
          id: true,
          key: true,
          nameAr: true,
          items: {
            select: { id: true, itemCode: true, nameAr: true, priceMinor: true, descriptionAr: true },
          },
        },
      },
    },
  });
}

export async function planMenuText(
  user: AuthenticatedUser,
  businessId: string,
  text: string,
): Promise<PastePlan> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: context.businessId },
    select: { currency: true },
  });
  const menu = await targetMenu(context.businessId);
  const parsed = parseMenuText(text);
  const problems = [...parsed.problems];
  const counts = { new: 0, update: 0, same: 0 };

  const sections = parsed.sections.map((section) => {
    const existing = menu?.categories.find((category) => fold(category.nameAr) === section.name);
    const dishes: PasteDishPlan[] = [];
    for (const dish of section.dishes) {
      const priceMinor = parsePriceToMinor(dish.price, business.currency);
      if (priceMinor === null) {
        problems.push({ line: dish.line, text: `${dish.name} | ${dish.price}`, problem: `“${dish.price}” has more decimals than ${business.currency} uses` });
        continue;
      }
      const match = existing?.items.find((item) => fold(item.nameAr) === dish.name);
      const status: PasteDishPlan['status'] = !match
        ? 'new'
        : match.priceMinor === priceMinor && (dish.description === null || match.descriptionAr === dish.description)
          ? 'same'
          : 'update';
      counts[status] += 1;
      dishes.push({
        ...dish,
        price: formatMinorAsDecimal(priceMinor, business.currency),
        status,
      });
    }
    return { name: section.name, isNew: !existing, dishes };
  });

  problems.sort((a, b) => a.line - b.line);
  return { sections: sections.filter((section) => section.dishes.length > 0), problems, counts };
}

/** Saves what `planMenuText` shows. Returns the same plan, as saved. */
export async function saveMenuText(user: AuthenticatedUser, businessId: string, text: string): Promise<PastePlan> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');
  const plan = await planMenuText(user, businessId, text);

  const menuId =
    (await targetMenu(context.businessId))?.id ??
    (
      await createMenu(user, businessId, {
        key: 'main',
        titleAr: 'المنيو',
        titleEn: 'Menu',
        status: 'ACTIVE',
        sortOrder: 0,
      })
    ).id;

  for (const section of plan.sections) {
    const menu = await targetMenu(context.businessId);
    const category =
      menu?.categories.find((candidate) => fold(candidate.nameAr) === section.name) ??
      (await createCategory(user, businessId, menuId, {
        nameAr: section.name,
        nameEn: null,
        descriptionAr: null,
        descriptionEn: null,
        isActive: true,
        isFeatured: false,
      }));
    const existingItems = 'items' in category ? category.items : [];

    for (const [index, dish] of section.dishes.entries()) {
      if (dish.status === 'same') continue;
      const match = existingItems.find((item) => fold(item.nameAr) === dish.name);

      if (match) {
        // Only what the text says changes; the rest of the dish is kept.
        const full = await prisma.menuItem.findUniqueOrThrow({ where: { id: match.id } });
        await upsertItem(user, businessId, {
          itemCode: full.itemCode,
          categoryKey: category.key,
          menuId,
          nameAr: full.nameAr,
          nameEn: full.nameEn,
          descriptionAr: dish.description ?? full.descriptionAr,
          descriptionEn: full.descriptionEn,
          price: dish.price,
          calories: full.calories,
          servingSizeAr: full.servingSizeAr,
          servingSizeEn: full.servingSizeEn,
          ingredientsAr: full.ingredientsAr,
          ingredientsEn: full.ingredientsEn,
          allergens: full.allergens as ('gluten' | 'milk' | 'egg' | 'nuts' | 'peanuts' | 'soy' | 'fish' | 'shellfish')[],
          tags: full.tags,
          availability: full.availability,
          isFeatured: full.isFeatured,
          sortOrder: full.sortOrder,
        });
        continue;
      }

      // A code made from the section and dish names, so the same text gives
      // the same code; a fresh one if that is somehow already taken.
      let itemCode = `P-${stableHash(`${section.name}|${dish.name}`)}`.toUpperCase();
      const taken = await prisma.menuItem.findUnique({
        where: { businessId_itemCode: { businessId: context.businessId, itemCode } },
        select: { id: true },
      });
      if (taken) itemCode = await newItemCode(user, businessId);

      await upsertItem(user, businessId, {
        itemCode,
        categoryKey: category.key,
        menuId,
        nameAr: dish.name,
        nameEn: null,
        descriptionAr: dish.description,
        descriptionEn: null,
        price: dish.price,
        calories: null,
        servingSizeAr: null,
        servingSizeEn: null,
        ingredientsAr: null,
        ingredientsEn: null,
        allergens: [],
        tags: [],
        availability: 'AVAILABLE',
        isFeatured: false,
        sortOrder: existingItems.length + index,
      });
    }
  }

  return plan;
}
