import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Deterministic development seed.
 *
 * Deterministic on purpose: public ids, slugs, menu keys and item codes are
 * fixed literals, so E2E tests can navigate to `/m/DEM001` and assert on a
 * known price, and a developer's database matches CI's. Re-running is safe —
 * every write is an upsert keyed on a natural unique column.
 *
 * Demo content is fictional and labelled as such (master spec §145).
 *
 * Calories are seeded only where a demo business would plausibly have measured
 * them, and are marked as demo data throughout — the rule the platform must
 * never break is presenting *invented* nutrition data as a real business's
 * verified figures (§37; GOALS I9).
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string });
const prisma = new PrismaClient({ adapter });

interface SeedItem {
  code: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr?: string;
  descriptionEn?: string;
  priceMinor: number | null;
  calories?: number;
  allergens?: string[];
  tags?: string[];
  featured?: boolean;
  availability?: 'AVAILABLE' | 'UNAVAILABLE' | 'SEASONAL' | 'HIDDEN';
}

interface SeedCategory {
  key: string;
  nameAr: string;
  nameEn: string | null;
  descriptionAr?: string;
  descriptionEn?: string;
  items: SeedItem[];
}

async function main() {
  const staff = await prisma.user.upsert({
    where: { email: 'staff@example.com' },
    update: {},
    create: {
      email: 'staff@example.com',
      name: 'Demo Staff',
      role: 'SUPER_ADMIN',
      // No password is set here: credentials are provisioned in Phase 3, and
      // seeding a known one into every environment would be a liability.
      passwordHash: null,
    },
  });

  // Demo rows converge on re-seed: `update` carries the same payload as
  // `create`, so re-running after the demo content changes refreshes the row
  // rather than leaving a stale one.
  const demoRestaurant = {
    slug: 'demo-restaurant',
    type: 'RESTAURANT',
    status: 'ACTIVE',
    defaultLocale: 'ar',
    currency: 'SAR',
    nameAr: 'مطعم النموذج',
    nameEn: 'Demo Restaurant',
    descriptionAr: 'ملف تجريبي لعرض المنصة. جميع البيانات تجريبية.',
    descriptionEn: 'A demo profile used to exercise the platform. All data is fictional.',
    templateKey: 'editorial',
    variantKey: 'a',
    phone: '+966500000000',
    whatsapp: '+966500000000',
    instagram: 'https://instagram.com/example',
    googleMapsUrl: 'https://maps.google.com/?q=24.7136,46.6753',
    addressAr: 'الرياض، المملكة العربية السعودية',
    addressEn: 'Riyadh, Saudi Arabia',
    showPlatformFooter: true,
  } as const;

  const business = await prisma.business.upsert({
    where: { publicId: 'DEM001' },
    update: demoRestaurant,
    create: { publicId: 'DEM001', ...demoRestaurant },
  });

  await prisma.brandTheme.upsert({
    where: { businessId: business.id },
    update: {},
    create: {
      businessId: business.id,
      colorPrimary: '#2B2118',
      colorSecondary: '#7C6A52',
      colorAccent: '#B8874B',
      colorBackground: '#FAF6F0',
      colorSurface: '#FFFFFF',
      colorText: '#1A1613',
      colorMuted: '#6E635A',
      colorBorder: '#E6DDD1',
      fontHeading: 'system-serif',
      fontBody: 'system-sans',
      radiusScale: 'sm',
    },
  });

  // A business with Arabic-only content, to exercise the
  // no-fabricated-translation path for an English visitor (GOALS I9).
  const demoCafe = {
    slug: 'demo-cafe',
    type: 'CAFE',
    status: 'ACTIVE',
    defaultLocale: 'ar',
    nameAr: 'مقهى النموذج',
    nameEn: null,
    descriptionAr: 'مقهى تجريبي بمحتوى عربي فقط.',
    descriptionEn: null,
    templateKey: 'editorial',
    variantKey: 'a',
  } as const;

  const arabicOnly = await prisma.business.upsert({
    where: { publicId: 'DEM002' },
    update: demoCafe,
    create: { publicId: 'DEM002', ...demoCafe },
  });

  // A draft business must never be publicly readable.
  await prisma.business.upsert({
    where: { publicId: 'DRAFT1' },
    update: {},
    create: {
      publicId: 'DRAFT1',
      slug: 'demo-draft',
      type: 'BAKERY',
      status: 'DRAFT',
      nameAr: 'مخبز تحت الإنشاء',
      nameEn: 'Draft Bakery',
      templateKey: 'editorial',
      variantKey: 'a',
    },
  });

  await prisma.businessMembership.upsert({
    where: { userId_businessId: { userId: staff.id, businessId: business.id } },
    update: {},
    create: { userId: staff.id, businessId: business.id, role: 'OWNER' },
  });

  // Two branches, so the branch QR path and the override mechanism are both
  // exercised by the demo data.
  const olaya = await prisma.branch.upsert({
    where: { businessId_key: { businessId: business.id, key: 'olaya' } },
    update: { phone: '+966500000001', whatsapp: '+966500000001' },
    create: {
      businessId: business.id,
      key: 'olaya',
      nameAr: 'فرع العليا',
      nameEn: 'Olaya Branch',
      addressAr: 'شارع العليا، الرياض',
      addressEn: 'Olaya Street, Riyadh',
      phone: '+966500000001',
      whatsapp: '+966500000001',
      googleMapsUrl: 'https://maps.google.com/?q=24.6944,46.6856',
      sortOrder: 0,
    },
  });

  await prisma.branch.upsert({
    where: { businessId_key: { businessId: business.id, key: 'malaz' } },
    update: {},
    create: {
      businessId: business.id,
      key: 'malaz',
      nameAr: 'فرع الملز',
      nameEn: 'Malaz Branch',
      addressAr: 'حي الملز، الرياض',
      addressEn: 'Al Malaz, Riyadh',
      phone: '+966500000002',
      sortOrder: 1,
    },
  });

  const restaurantMenu: SeedCategory[] = [
    {
      key: 'starters',
      nameAr: 'المقبلات',
      nameEn: 'Starters',
      descriptionAr: 'تُقدّم طازجة يومياً.',
      descriptionEn: 'Prepared fresh daily.',
      items: [
        {
          code: 'ST-001',
          nameAr: 'حمص بالطحينة',
          nameEn: 'Hummus',
          descriptionAr: 'حمص مهروس مع الطحينة وزيت الزيتون.',
          descriptionEn: 'Blended chickpeas with tahini and olive oil.',
          priceMinor: 1800,
          calories: 320,
          allergens: ['soy'],
          tags: ['vegetarian'],
        },
        {
          code: 'ST-002',
          nameAr: 'فتوش',
          nameEn: 'Fattoush',
          priceMinor: 2200,
          calories: 210,
          allergens: ['gluten'],
        },
      ],
    },
    {
      key: 'mains',
      nameAr: 'الأطباق الرئيسية',
      nameEn: 'Main Courses',
      items: [
        {
          code: 'MN-001',
          nameAr: 'برجر دجاج',
          nameEn: 'Chicken Burger',
          descriptionAr: 'صدر دجاج مشوي مع صلصة المطعم الخاصة.',
          descriptionEn: 'Grilled chicken breast with the house sauce.',
          priceMinor: 4200,
          calories: 680,
          allergens: ['gluten', 'egg'],
          featured: true,
        },
        {
          code: 'MN-002',
          nameAr: 'برجر لحم',
          nameEn: 'Beef Burger',
          priceMinor: 4500,
          calories: 720,
          allergens: ['gluten', 'milk'],
        },
        {
          code: 'MN-003',
          nameAr: 'طبق موسمي',
          nameEn: 'Seasonal Plate',
          // No price: an item awaiting pricing must render without one rather
          // than inventing a figure.
          priceMinor: null,
          availability: 'UNAVAILABLE',
        },
      ],
    },
    {
      key: 'drinks',
      nameAr: 'المشروبات',
      nameEn: 'Drinks',
      items: [
        {
          code: 'DR-001',
          nameAr: 'ليموناضة بالنعناع',
          nameEn: 'Mint Lemonade',
          priceMinor: 1500,
          calories: 120,
        },
        {
          code: 'DR-002',
          nameAr: 'ماء',
          nameEn: 'Water',
          priceMinor: 300,
        },
        {
          code: 'DR-003',
          nameAr: 'صنف مخفي',
          nameEn: 'Hidden Item',
          priceMinor: 999,
          // Hidden items exist in the database but never reach a visitor.
          availability: 'HIDDEN',
        },
      ],
    },
  ];

  const cafeMenu: SeedCategory[] = [
    {
      key: 'coffee',
      nameAr: 'القهوة',
      nameEn: null,
      items: [
        { code: 'CF-001', nameAr: 'قهوة مختصة', nameEn: null, priceMinor: 1800 },
        { code: 'CF-002', nameAr: 'لاتيه', nameEn: null, priceMinor: 2000 },
      ],
    },
  ];

  await seedMenu(business.id, 'main', 'المنيو الرئيسي', 'Main Menu', restaurantMenu, staff.id);
  await seedMenu(arabicOnly.id, 'main', 'قائمة المشروبات', null, cafeMenu, staff.id);

  // A draft menu on an active business: present in the database, invisible.
  await prisma.menu.upsert({
    where: { businessId_key: { businessId: business.id, key: 'seasonal' } },
    update: {},
    create: {
      businessId: business.id,
      key: 'seasonal',
      status: 'DRAFT',
      titleAr: 'قائمة موسمية',
      titleEn: 'Seasonal Menu',
      sortOrder: 1,
    },
  });

  // The Olaya branch charges more for the chicken burger — the branch-override
  // mechanism, exercised by demo data (§86).
  const chickenBurger = await prisma.menuItem.findUnique({
    where: { businessId_itemCode: { businessId: business.id, itemCode: 'MN-001' } },
    select: { id: true },
  });

  if (chickenBurger) {
    await prisma.branchItemOverride.upsert({
      where: { branchId_itemId: { branchId: olaya.id, itemId: chickenBurger.id } },
      update: {},
      create: { branchId: olaya.id, itemId: chickenBurger.id, priceMinor: 4600 },
    });
  }

  console.log(
    'Seed complete: /m/DEM001 (+ /b/olaya, /b/malaz), /m/DEM002 active; /m/DRAFT1 draft.',
  );
}

async function seedMenu(
  businessId: string,
  key: string,
  titleAr: string,
  titleEn: string | null,
  categories: SeedCategory[],
  publishedById: string,
) {
  const menu = await prisma.menu.upsert({
    where: { businessId_key: { businessId, key } },
    update: {},
    create: { businessId, key, status: 'ACTIVE', titleAr, titleEn, sortOrder: 0 },
  });

  for (const [categoryIndex, category] of categories.entries()) {
    const categoryRow = await prisma.menuCategory.upsert({
      where: { menuId_key: { menuId: menu.id, key: category.key } },
      update: {},
      create: {
        menuId: menu.id,
        businessId,
        key: category.key,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        descriptionAr: category.descriptionAr ?? null,
        descriptionEn: category.descriptionEn ?? null,
        sortOrder: categoryIndex,
      },
    });

    for (const [itemIndex, item] of category.items.entries()) {
      await prisma.menuItem.upsert({
        where: { businessId_itemCode: { businessId, itemCode: item.code } },
        update: {},
        create: {
          businessId,
          categoryId: categoryRow.id,
          itemCode: item.code,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          descriptionAr: item.descriptionAr ?? null,
          descriptionEn: item.descriptionEn ?? null,
          priceMinor: item.priceMinor,
          currency: 'SAR',
          calories: item.calories ?? null,
          allergens: item.allergens ?? [],
          tags: item.tags ?? [],
          isFeatured: item.featured ?? false,
          availability: item.availability ?? 'AVAILABLE',
          sortOrder: itemIndex,
        },
      });
    }
  }

  // Publish: create the version, then repoint the menu. Atomic, because a menu
  // observed with no current version would be invisible to visitors.
  await prisma.$transaction(async (tx) => {
    const version = await tx.menuVersion.upsert({
      where: { menuId_version: { menuId: menu.id, version: 1 } },
      update: {},
      create: {
        menuId: menu.id,
        version: 1,
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        publishedById,
        notes: 'Seed publication',
      },
    });

    await tx.menu.update({ where: { id: menu.id }, data: { currentVersionId: version.id } });
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
