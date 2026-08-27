import { prisma } from '@/server/db/client';
import { requireTenantContext, type AuthenticatedUser } from '@/server/tenancy/context';
import { recordAudit } from '@/server/audit/log';
import { DEFAULT_THEME_KEY, isKnownTheme, resolveTheme, type ResolvedMenuTheme } from '@/menu-studio/themes';
import { fontsForRole, type FontRole } from '@/menu-studio/typography';

/**
 * A menu's design settings (Menu Studio §4, §15, §30).
 *
 * The guarantee this module exists to keep: **changing a design never touches
 * menu data**. Every write here is confined to the `menu_designs` row. Items,
 * categories, prices, descriptions, images and modifiers are not reachable
 * from any code path below, which is why "switch the theme" cannot lose a
 * price. `tests/integration/menu-studio.test.ts` proves it by snapshotting the
 * whole menu around a theme change.
 */

export interface DesignInput {
  themeKey?: string;
  layoutKey?: string;
  fontHeading?: string | null;
  fontBody?: string | null;
  fontPrice?: string | null;
  fontAccent?: string | null;
  imageStyle?: string | null;
  density?: string | null;
  showPrices?: boolean;
  showImages?: boolean;
  showCalories?: boolean;
}

export interface MenuDesignView {
  menuId: string;
  themeKey: string;
  layoutKey: string;
  fonts: {
    heading: string | null;
    body: string | null;
    price: string | null;
    accent: string | null;
  };
  imageStyle: string | null;
  density: string | null;
  showPrices: boolean;
  showImages: boolean;
  showCalories: boolean;
  resolved: ResolvedMenuTheme;
}

interface DesignRow {
  themeKey: string;
  layoutKey: string;
  fontHeading: string | null;
  fontBody: string | null;
  fontPrice: string | null;
  fontAccent: string | null;
  imageStyle: string | null;
  density: string | null;
  showPrices: boolean;
  showImages: boolean;
  showCalories: boolean;
}

const DEFAULTS: DesignRow = {
  themeKey: DEFAULT_THEME_KEY,
  layoutKey: 'a',
  fontHeading: null,
  fontBody: null,
  fontPrice: null,
  fontAccent: null,
  imageStyle: null,
  density: null,
  showPrices: true,
  showImages: true,
  showCalories: true,
};

function toView(row: DesignRow & { menuId: string }): MenuDesignView {
  return {
    menuId: row.menuId,
    themeKey: row.themeKey,
    layoutKey: row.layoutKey,
    fonts: {
      heading: row.fontHeading,
      body: row.fontBody,
      price: row.fontPrice,
      accent: row.fontAccent,
    },
    imageStyle: row.imageStyle,
    density: row.density,
    showPrices: row.showPrices,
    showImages: row.showImages,
    showCalories: row.showCalories,
    resolved: resolveTheme(row.themeKey, row.layoutKey),
  };
}

/** A menu with no design row yet renders in the default theme, not in nothing. */
export async function getMenuDesign(
  user: AuthenticatedUser,
  businessId: string,
  menuId: string,
): Promise<MenuDesignView> {
  const context = await requireTenantContext(user, businessId, 'VIEWER');

  const design = await prisma.menuDesign.findFirst({
    where: { menuId, businessId: context.businessId },
  });

  return toView({ ...DEFAULTS, ...(design ?? {}), menuId });
}

function assertFont(role: FontRole, key: string | null | undefined) {
  if (key === null || key === undefined) return;
  if (!fontsForRole(role).some((face) => face.key === key)) {
    throw new Error(`${key} is not a font available for the ${role} role.`);
  }
}

export async function updateMenuDesign(
  user: AuthenticatedUser,
  businessId: string,
  menuId: string,
  input: DesignInput,
): Promise<MenuDesignView> {
  const context = await requireTenantContext(user, businessId, 'EDITOR');

  // The menu is fetched through the tenant scope: a menu id from another
  // business matches nothing and the update never happens.
  const menu = await prisma.menu.findFirst({
    where: { id: menuId, businessId: context.businessId },
    select: { id: true },
  });

  if (!menu) throw new Error('That menu does not exist.');

  const existing = await prisma.menuDesign.findFirst({
    where: { menuId, businessId: context.businessId },
  });

  const themeKey = input.themeKey ?? existing?.themeKey ?? DEFAULTS.themeKey;
  const layoutKey = input.layoutKey ?? (input.themeKey ? 'a' : existing?.layoutKey ?? DEFAULTS.layoutKey);

  if (!isKnownTheme(themeKey, layoutKey)) {
    throw new Error(`${themeKey}/${layoutKey} is not a theme and layout this platform has.`);
  }

  assertFont('heading', input.fontHeading);
  assertFont('body', input.fontBody);
  assertFont('price', input.fontPrice);
  assertFont('accent', input.fontAccent);

  const data = {
    themeKey,
    layoutKey,
    ...(input.fontHeading !== undefined ? { fontHeading: input.fontHeading } : {}),
    ...(input.fontBody !== undefined ? { fontBody: input.fontBody } : {}),
    ...(input.fontPrice !== undefined ? { fontPrice: input.fontPrice } : {}),
    ...(input.fontAccent !== undefined ? { fontAccent: input.fontAccent } : {}),
    ...(input.imageStyle !== undefined ? { imageStyle: input.imageStyle } : {}),
    ...(input.density !== undefined ? { density: input.density } : {}),
    ...(input.showPrices !== undefined ? { showPrices: input.showPrices } : {}),
    ...(input.showImages !== undefined ? { showImages: input.showImages } : {}),
    ...(input.showCalories !== undefined ? { showCalories: input.showCalories } : {}),
  };

  const design = await prisma.menuDesign.upsert({
    where: { menuId },
    update: data,
    create: { menuId, businessId: context.businessId, ...DEFAULTS, ...data },
  });

  await recordAudit({
    action: 'design.updated',
    entity: 'menu_design',
    entityId: design.id,
    businessId: context.businessId,
    userId: user.id,
    metadata: { themeKey, layoutKey, changed: Object.keys(input) },
  });

  return toView({ ...DEFAULTS, ...design });
}
