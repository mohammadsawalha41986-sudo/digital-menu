import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Deterministic development seed.
 *
 * Deterministic on purpose: public ids, slugs and menu keys are fixed literals,
 * so E2E tests can navigate to `/m/DEM001` and a developer's local database
 * matches CI's. Re-running is safe — every write is an upsert keyed on a
 * natural unique column.
 *
 * Demo content is fictional and labelled as such (master spec §145). Prices,
 * calories and imagery are *not* invented here: Phase 0 seeds only the
 * structural foundation, and fabricated nutrition data is explicitly forbidden
 * (§37; GOALS I9).
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string });
const prisma = new PrismaClient({ adapter });

async function main() {
  const staff = await prisma.user.upsert({
    where: { email: 'staff@example.com' },
    update: {},
    create: {
      email: 'staff@example.com',
      name: 'Demo Staff',
      role: 'SUPER_ADMIN',
      // No password is set: authentication ships in Phase 3, and seeding a
      // known credential into every environment would be a liability.
      passwordHash: null,
    },
  });

  const business = await prisma.business.upsert({
    where: { publicId: 'DEM001' },
    update: {},
    create: {
      publicId: 'DEM001',
      slug: 'demo-restaurant',
      type: 'RESTAURANT',
      status: 'ACTIVE',
      defaultLocale: 'ar',
      nameAr: 'مطعم النموذج',
      nameEn: 'Demo Restaurant',
      descriptionAr: 'ملف تجريبي لعرض المنصة. جميع البيانات تجريبية.',
      descriptionEn: 'A demo profile used to exercise the platform. All data is fictional.',
      templateKey: 'editorial',
      variantKey: 'a',
    },
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

  // A business with an Arabic-only name, to prove the no-fabricated-translation
  // path renders correctly for an English visitor (GOALS I9).
  const arabicOnly = await prisma.business.upsert({
    where: { publicId: 'DEM002' },
    update: {},
    create: {
      publicId: 'DEM002',
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
    },
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

  // A published menu, so the public route exercises the
  // business → menu → current version chain.
  for (const [target, key, titleAr, titleEn] of [
    [business, 'main', 'المنيو الرئيسي', 'Main Menu'],
    [arabicOnly, 'main', 'قائمة المشروبات', null],
  ] as const) {
    const menu = await prisma.menu.upsert({
      where: { businessId_key: { businessId: target.id, key } },
      update: {},
      create: {
        businessId: target.id,
        key,
        status: 'ACTIVE',
        titleAr,
        titleEn,
        sortOrder: 0,
      },
    });

    const version = await prisma.menuVersion.upsert({
      where: { menuId_version: { menuId: menu.id, version: 1 } },
      update: {},
      create: {
        menuId: menu.id,
        version: 1,
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        publishedById: staff.id,
        notes: 'Seed publication',
      },
    });

    await prisma.menu.update({
      where: { id: menu.id },
      data: { currentVersionId: version.id },
    });
  }

  // A draft menu on an active business: present in the database, invisible to
  // visitors.
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

  console.log('Seed complete: /m/DEM001, /m/DEM002 (active), /m/DRAFT1 (draft, not public)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
