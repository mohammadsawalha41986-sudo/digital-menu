import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { generatePassword, hashPassword } from '../src/server/auth/password';

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
  servingSize?: string;
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

/**
 * Opening-hour patterns for the demo businesses (§74, §134).
 *
 * Each is shaped like the trade it belongs to: a fine-dining room opens only
 * for dinner and runs past midnight, a bakery starts before dawn and closes
 * mid-afternoon, a salon shuts one day a week. Six identical weeks would make
 * the six demos read as one business again, which is exactly what §174 tests.
 */
type SeedHours = {
  timezone: string;
  days: Record<string, { closed: boolean; intervals: { opens: string; closes: string }[] }>;
};

const RIYADH = 'Asia/Riyadh';

function week(
  pattern: Partial<Record<string, { opens: string; closes: string }[] | 'closed'>>,
): SeedHours {
  const days: SeedHours['days'] = {};

  for (const [day, value] of Object.entries(pattern)) {
    days[day] =
      value === 'closed'
        ? { closed: true, intervals: [] }
        : { closed: false, intervals: value ?? [] };
  }

  return { timezone: RIYADH, days };
}

const EVERY_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function sameEveryDay(intervals: { opens: string; closes: string }[]): SeedHours {
  return week(Object.fromEntries(EVERY_DAY.map((day) => [day, intervals])));
}

/** Dinner only, running past midnight at the weekend. */
const FINE_DINING_HOURS = week({
  sunday: [{ opens: '18:00', closes: '23:30' }],
  monday: 'closed',
  tuesday: [{ opens: '18:00', closes: '23:30' }],
  wednesday: [{ opens: '18:00', closes: '23:30' }],
  thursday: [{ opens: '18:00', closes: '01:00' }],
  friday: [{ opens: '18:00', closes: '01:00' }],
  saturday: [{ opens: '18:00', closes: '23:30' }],
});

/** Long single shift, seven days — the café pattern. */
const CAFE_HOURS = sameEveryDay([{ opens: '07:00', closes: '23:00' }]);

/** Late-night burger trade. */
const BURGER_HOURS = sameEveryDay([{ opens: '12:00', closes: '02:00' }]);

/** Bakers start early and are gone by mid-afternoon. */
const BAKERY_HOURS = week({
  sunday: [{ opens: '05:30', closes: '15:00' }],
  monday: [{ opens: '05:30', closes: '15:00' }],
  tuesday: [{ opens: '05:30', closes: '15:00' }],
  wednesday: [{ opens: '05:30', closes: '15:00' }],
  thursday: [{ opens: '05:30', closes: '15:00' }],
  friday: 'closed',
  saturday: [{ opens: '06:30', closes: '13:00' }],
});

/** A salon: split shift around the afternoon break, closed on Friday. */
const SALON_HOURS = week({
  sunday: [{ opens: '10:00', closes: '13:30' }, { opens: '16:00', closes: '21:00' }],
  monday: [{ opens: '10:00', closes: '13:30' }, { opens: '16:00', closes: '21:00' }],
  tuesday: [{ opens: '10:00', closes: '13:30' }, { opens: '16:00', closes: '21:00' }],
  wednesday: [{ opens: '10:00', closes: '13:30' }, { opens: '16:00', closes: '21:00' }],
  thursday: [{ opens: '10:00', closes: '13:30' }, { opens: '16:00', closes: '22:00' }],
  friday: 'closed',
  saturday: [{ opens: '12:00', closes: '21:00' }],
});

/**
 * One branch keeping different hours from its business — the reason hours are
 * stored per branch at all. Olaya serves later than the main location.
 */
const LATE_BRANCH_HOURS = sameEveryDay([
  { opens: '12:00', closes: '15:30' },
  { opens: '18:00', closes: '01:00' },
]);

/** Family restaurant: lunch and dinner, with the kitchen closed between. */
const RESTAURANT_HOURS = sameEveryDay([
  { opens: '12:00', closes: '15:30' },
  { opens: '18:00', closes: '23:59' },
]);

/**
 * Demo offers, one per placement (§115).
 *
 * The three placements are three different designs, so the demo has to carry
 * all three or the difference is unprovable: a hero the page leads with, a
 * banner strip that announces without displacing, and an ordinary section
 * entry. Windows are left open — an offer whose demo expires silently is a
 * support ticket, not a demonstration.
 */
async function seedOffers(
  businessId: string,
  offers: {
    key: string;
    titleAr: string;
    titleEn: string;
    descriptionAr?: string;
    descriptionEn?: string;
    placement: 'HERO' | 'BANNER' | 'SECTION' | 'FEATURED';
    originalPriceMinor?: number;
    offerPriceMinor?: number;
    discountPercent?: number;
    sortOrder?: number;
  }[],
) {
  for (const offer of offers) {
    const payload = {
      businessId,
      titleAr: offer.titleAr,
      titleEn: offer.titleEn,
      descriptionAr: offer.descriptionAr ?? null,
      descriptionEn: offer.descriptionEn ?? null,
      placement: offer.placement,
      originalPriceMinor: offer.originalPriceMinor ?? null,
      offerPriceMinor: offer.offerPriceMinor ?? null,
      discountPercent: offer.discountPercent ?? null,
      isActive: true,
      sortOrder: offer.sortOrder ?? 0,
    };

    await prisma.offer.upsert({
      where: { businessId_key: { businessId, key: offer.key } },
      update: payload,
      create: { key: offer.key, ...payload },
    });
  }
}

async function main() {
  const staff = await provisionStaffUser();

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
    workingHours: RESTAURANT_HOURS,
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
    workingHours: CAFE_HOURS,
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
    update: {
      phone: '+966500000001',
      whatsapp: '+966500000001',
      workingHours: LATE_BRANCH_HOURS,
    },
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
      workingHours: LATE_BRANCH_HOURS,
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

  // All three placements on one profile, so the difference is visible at once.
  await seedOffers(business.id, [
    {
      key: 'family-night',
      titleAr: 'ليلة العائلة',
      titleEn: 'Family Night',
      descriptionAr: 'طبقان رئيسيان ومقبلات ومشروبان.',
      descriptionEn: 'Two mains, a starter and two drinks.',
      placement: 'HERO',
      originalPriceMinor: 18000,
      offerPriceMinor: 12600,
      discountPercent: 30,
    },
    {
      key: 'weekday-lunch',
      titleAr: 'غداء أيام الأسبوع',
      titleEn: 'Weekday lunch',
      placement: 'BANNER',
      offerPriceMinor: 3900,
      sortOrder: 1,
    },
    {
      key: 'coffee-with-dessert',
      titleAr: 'قهوة مع الحلى',
      titleEn: 'Coffee with dessert',
      descriptionAr: 'مع أي طبق حلى.',
      descriptionEn: 'With any dessert.',
      placement: 'SECTION',
      originalPriceMinor: 2600,
      offerPriceMinor: 1800,
      discountPercent: 31,
      sortOrder: 2,
    },
  ]);
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

  await seedShowcase(staff.id);

  console.log(
    [
      'Seed complete.',
      '  /m/DEM001  editorial  demo restaurant (+ /b/olaya, /b/malaz)',
      '  /m/DEM002  editorial  Arabic-only café',
      '  /m/DEM003  luxury     fine dining',
      '  /m/DEM004  cafe       specialty roastery',
      '  /m/DEM005  bold       burger',
      '  /m/DEM006  casual     bakery',
      '  /m/DEM007  hospitality salon (services, durations)',
      '  /m/DRAFT1  draft — deliberately not public',
    ].join('\n'),
  );
}


/**
 * The six demo businesses the specification requires (§92, §141).
 *
 * Their purpose is the design QA in §140: placed side by side they must not
 * look like the same website. Each therefore uses a different template family,
 * a different palette, different typography and different content shape — the
 * salon in particular is a service catalogue with durations, not a food menu
 * (§94).
 *
 * All content is fictional and labelled as demo data (§145).
 */
async function seedShowcase(publishedById: string) {
  const showcase = [
    {
      publicId: 'DEM003',
      offer: {
        key: 'tasting-menu',
        titleAr: 'قائمة التذوق',
        titleEn: 'Tasting menu',
        descriptionAr: 'سبعة أطباق من المطبخ.',
        descriptionEn: 'Seven courses from the kitchen.',
        placement: 'HERO' as const,
        originalPriceMinor: 45000,
        offerPriceMinor: 38000,
        discountPercent: 16,
      },
      hours: FINE_DINING_HOURS,
      slug: 'demo-luxury-restaurant',
      type: 'RESTAURANT' as const,
      template: 'luxury',
      variant: 'a',
      nameAr: 'مطعم السرايا',
      nameEn: 'Saraya Fine Dining',
      descriptionAr: 'تجربة عشاء راقية. بيانات تجريبية.',
      descriptionEn: 'A fine-dining concept. Demo data.',
      brand: {
        colorPrimary: '#1B1F23',
        colorSecondary: '#3C4A52',
        colorAccent: '#A98F57',
        colorBackground: '#F5F3EE',
        colorSurface: '#FFFFFF',
        colorText: '#14171A',
        colorMuted: '#6B7076',
        colorBorder: '#DDD8CC',
        fontHeading: 'system-serif',
        fontBody: 'system-serif',
        radiusScale: 'none',
      },
      categories: [
        {
          key: 'first',
          nameAr: 'المقبلات',
          nameEn: 'First Course',
          items: [
            { code: 'SR-001', nameAr: 'كريمة الكمأة', nameEn: 'Truffle Velouté', price: 8500, featured: true },
            { code: 'SR-002', nameAr: 'سلطة الشمندر', nameEn: 'Beetroot & Goat Cheese', price: 7200 },
          ],
        },
        {
          key: 'main',
          nameAr: 'الأطباق الرئيسية',
          nameEn: 'Main Course',
          items: [
            { code: 'SR-010', nameAr: 'ضلع لحم', nameEn: 'Aged Short Rib', price: 21500, calories: 780 },
            { code: 'SR-011', nameAr: 'سمك القاروص', nameEn: 'Line-caught Sea Bass', price: 18900 },
          ],
        },
      ],
    },
    {
      publicId: 'DEM004',
      offer: {
        key: 'morning-filter',
        titleAr: 'قهوة الصباح',
        titleEn: 'Morning filter',
        placement: 'BANNER' as const,
        offerPriceMinor: 1200,
      },
      hours: CAFE_HOURS,
      slug: 'demo-specialty-cafe',
      type: 'CAFE' as const,
      template: 'cafe',
      variant: 'a',
      nameAr: 'محمصة الرصيف',
      nameEn: 'Curb Roastery',
      descriptionAr: 'قهوة مختصة تُحمّص يومياً. بيانات تجريبية.',
      descriptionEn: 'Specialty coffee, roasted daily. Demo data.',
      brand: {
        colorPrimary: '#2F5D50',
        colorSecondary: '#7FA99B',
        colorAccent: '#E07A3F',
        colorBackground: '#FBF7F0',
        colorSurface: '#FFFFFF',
        colorText: '#1E2A26',
        colorMuted: '#66756F',
        colorBorder: '#E3DCD0',
        fontHeading: 'system-sans',
        fontBody: 'system-sans',
        radiusScale: 'lg',
      },
      categories: [
        {
          key: 'espresso',
          nameAr: 'الإسبريسو',
          nameEn: 'Espresso',
          items: [
            { code: 'CB-001', nameAr: 'فلات وايت', nameEn: 'Flat White', price: 1900, serving: '180ml' },
            { code: 'CB-002', nameAr: 'كورتادو', nameEn: 'Cortado', price: 1700, serving: '120ml' },
            { code: 'CB-003', nameAr: 'أمريكانو', nameEn: 'Americano', price: 1500, serving: '240ml' },
          ],
        },
        {
          key: 'filter',
          nameAr: 'التقطير',
          nameEn: 'Filter',
          items: [
            { code: 'CB-010', nameAr: 'في60', nameEn: 'V60', price: 2400, serving: '250ml' },
            { code: 'CB-011', nameAr: 'كولد برو', nameEn: 'Cold Brew', price: 2200, serving: '300ml' },
          ],
        },
      ],
    },
    {
      publicId: 'DEM005',
      offer: {
        key: 'double-thursday',
        titleAr: 'خميس الدبل',
        titleEn: 'Double Thursday',
        descriptionAr: 'قطعة لحم إضافية بلا زيادة.',
        descriptionEn: 'An extra patty at no extra cost.',
        placement: 'HERO' as const,
        discountPercent: 50,
        originalPriceMinor: 4800,
        offerPriceMinor: 2400,
      },
      hours: BURGER_HOURS,
      slug: 'demo-burger',
      type: 'RESTAURANT' as const,
      template: 'bold',
      variant: 'a',
      nameAr: 'برجر المحطة',
      nameEn: 'Station Burger',
      descriptionAr: 'برجر مشوي على الفحم. بيانات تجريبية.',
      descriptionEn: 'Charcoal-grilled burgers. Demo data.',
      brand: {
        colorPrimary: '#B3202B',
        colorSecondary: '#2B2B2B',
        colorAccent: '#F2B705',
        colorBackground: '#FFFFFF',
        colorSurface: '#F7F7F7',
        colorText: '#141414',
        colorMuted: '#5C5C5C',
        colorBorder: '#141414',
        fontHeading: 'system-sans',
        fontBody: 'system-sans',
        radiusScale: 'none',
      },
      categories: [
        {
          key: 'burgers',
          nameAr: 'البرجر',
          nameEn: 'Burgers',
          items: [
            { code: 'ST-101', nameAr: 'الكلاسيكي', nameEn: 'The Classic', price: 3900, calories: 720, featured: true },
            { code: 'ST-102', nameAr: 'المزدوج', nameEn: 'Double Stack', price: 5200, calories: 980 },
            { code: 'ST-103', nameAr: 'الحار', nameEn: 'Hot One', price: 4300, calories: 760 },
          ],
        },
      ],
    },
    {
      publicId: 'DEM006',
      offer: {
        key: 'end-of-day-bread',
        titleAr: 'خبز آخر اليوم',
        titleEn: 'End-of-day bread',
        placement: 'BANNER' as const,
        discountPercent: 40,
        originalPriceMinor: 1800,
        offerPriceMinor: 1080,
      },
      hours: BAKERY_HOURS,
      slug: 'demo-bakery',
      type: 'BAKERY' as const,
      template: 'casual',
      variant: 'a',
      nameAr: 'مخبز الحي',
      nameEn: 'Neighbourhood Bakery',
      descriptionAr: 'يُخبز كل صباح. بيانات تجريبية.',
      descriptionEn: 'Baked every morning. Demo data.',
      brand: {
        colorPrimary: '#8A5A2B',
        colorSecondary: '#C79A6B',
        colorAccent: '#D9534F',
        colorBackground: '#FFF9F2',
        colorSurface: '#FFFFFF',
        colorText: '#2A1E14',
        colorMuted: '#7A6A5C',
        colorBorder: '#EADDCC',
        fontHeading: 'system-serif',
        fontBody: 'system-sans',
        radiusScale: 'md',
      },
      categories: [
        {
          key: 'bread',
          nameAr: 'الخبز',
          nameEn: 'Bread',
          items: [
            { code: 'BK-001', nameAr: 'خبز العجين المخمر', nameEn: 'Sourdough', price: 1800 },
            { code: 'BK-002', nameAr: 'باغيت', nameEn: 'Baguette', price: 900 },
          ],
        },
        {
          key: 'pastry',
          nameAr: 'المعجنات',
          nameEn: 'Pastry',
          items: [
            { code: 'BK-010', nameAr: 'كرواسون زبدة', nameEn: 'Butter Croissant', price: 1200, featured: true },
            { code: 'BK-011', nameAr: 'بان أو شوكولا', nameEn: 'Pain au Chocolat', price: 1400 },
          ],
        },
      ],
    },
    {
      publicId: 'DEM007',
      offer: {
        key: 'midweek-package',
        titleAr: 'باقة منتصف الأسبوع',
        titleEn: 'Midweek package',
        descriptionAr: 'قص وتصفيف وعناية.',
        descriptionEn: 'Cut, styling and care.',
        placement: 'SECTION' as const,
        originalPriceMinor: 42000,
        offerPriceMinor: 33000,
        discountPercent: 21,
      },
      hours: SALON_HOURS,
      slug: 'demo-luxury-salon',
      type: 'SALON' as const,
      template: 'hospitality',
      variant: 'a',
      nameAr: 'صالون نور',
      nameEn: 'Noor Salon',
      descriptionAr: 'خدمات العناية والتجميل بالحجز المسبق. بيانات تجريبية.',
      descriptionEn: 'Beauty and care services, by appointment. Demo data.',
      brand: {
        colorPrimary: '#4A2E4D',
        colorSecondary: '#8E6C88',
        colorAccent: '#C8A2C8',
        colorBackground: '#FAF6FA',
        colorSurface: '#FFFFFF',
        colorText: '#241428',
        colorMuted: '#6E5C70',
        colorBorder: '#E6DAE6',
        fontHeading: 'system-serif',
        fontBody: 'system-sans',
        radiusScale: 'lg',
      },
      // A salon is a service catalogue: durations, not calories (§94).
      categories: [
        {
          key: 'hair',
          nameAr: 'الشعر',
          nameEn: 'Hair',
          items: [
            { code: 'NS-001', nameAr: 'قص وتصفيف', nameEn: 'Cut & Style', price: 18000, serving: '60 min' },
            { code: 'NS-002', nameAr: 'صبغة كاملة', nameEn: 'Full Colour', price: 45000, serving: '150 min', featured: true },
          ],
        },
        {
          key: 'care',
          nameAr: 'العناية',
          nameEn: 'Treatments',
          items: [
            { code: 'NS-010', nameAr: 'عناية بالبشرة', nameEn: 'Facial', price: 26000, serving: '75 min' },
            { code: 'NS-011', nameAr: 'مانيكير', nameEn: 'Manicure', price: 12000, serving: '45 min' },
          ],
        },
      ],
    },
  ];

  for (const business of showcase) {
    const payload = {
      slug: business.slug,
      type: business.type,
      status: 'ACTIVE' as const,
      defaultLocale: 'ar' as const,
      currency: 'SAR',
      nameAr: business.nameAr,
      nameEn: business.nameEn,
      descriptionAr: business.descriptionAr,
      descriptionEn: business.descriptionEn,
      templateKey: business.template,
      variantKey: business.variant,
      showPlatformFooter: true,
      workingHours: business.hours,
    };

    const row = await prisma.business.upsert({
      where: { publicId: business.publicId },
      update: payload,
      create: { publicId: business.publicId, ...payload },
    });

    await prisma.brandTheme.upsert({
      where: { businessId: row.id },
      update: business.brand,
      create: { businessId: row.id, ...business.brand },
    });

    if (business.offer) await seedOffers(row.id, [business.offer]);

    await seedMenu(
      row.id,
      'main',
      'القائمة',
      'Menu',
      business.categories.map((category) => ({
        key: category.key,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        items: category.items.map((item) => ({
          code: item.code,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          priceMinor: item.price,
          calories: 'calories' in item ? (item.calories as number) : undefined,
          servingSize: 'serving' in item ? (item.serving as string) : undefined,
          featured: 'featured' in item ? (item.featured as boolean) : undefined,
        })),
      })),
      publishedById,
    );
  }
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
          servingSizeAr: item.servingSize ?? null,
          servingSizeEn: item.servingSize ?? null,
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

/**
 * Provisions the development staff account.
 *
 * The password comes from SEED_ADMIN_PASSWORD when set (CI, scripted
 * environments) and is otherwise generated and printed **once**. A hard-coded
 * credential in a seed is a credential in every environment that ever ran it.
 *
 * An existing account keeps its password: re-seeding must not silently reset
 * an operator's login.
 */
async function provisionStaffUser() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'staff@example.com';

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  if (existing?.passwordHash) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { role: 'SUPER_ADMIN', isActive: true },
    });
  }

  const password = process.env.SEED_ADMIN_PASSWORD ?? generatePassword();
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: 'SUPER_ADMIN', isActive: true },
    create: { email, name: 'Demo Staff', role: 'SUPER_ADMIN', passwordHash },
  });

  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log('');
    console.log('  Admin account provisioned — this password is shown once:');
    console.log(`    email:    ${email}`);
    console.log(`    password: ${password}`);
    console.log('');
  }

  return user;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
