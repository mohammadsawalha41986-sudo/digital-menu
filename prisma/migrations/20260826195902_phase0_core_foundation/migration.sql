-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "BusinessRole" AS ENUM ('OWNER', 'MANAGER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RESTAURANT', 'CAFE', 'BAKERY', 'DESSERT', 'SALON', 'BEAUTY_CENTER', 'SPA', 'BARBER', 'GYM', 'HOTEL', 'RETAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ar', 'en');

-- CreateEnum
CREATE TYPE "MenuStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "PlatformRole" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "BusinessType" NOT NULL DEFAULT 'OTHER',
    "status" "BusinessStatus" NOT NULL DEFAULT 'DRAFT',
    "defaultLocale" "Locale" NOT NULL DEFAULT 'ar',
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "templateKey" TEXT NOT NULL DEFAULT 'editorial',
    "variantKey" TEXT NOT NULL DEFAULT 'a',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" "BusinessRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_themes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "colorPrimary" TEXT NOT NULL DEFAULT '#1F2421',
    "colorSecondary" TEXT NOT NULL DEFAULT '#49A078',
    "colorAccent" TEXT NOT NULL DEFAULT '#C9A227',
    "colorBackground" TEXT NOT NULL DEFAULT '#FBF9F5',
    "colorSurface" TEXT NOT NULL DEFAULT '#FFFFFF',
    "colorText" TEXT NOT NULL DEFAULT '#16181A',
    "colorMuted" TEXT NOT NULL DEFAULT '#6B7280',
    "colorBorder" TEXT NOT NULL DEFAULT '#E5E1D8',
    "fontHeading" TEXT NOT NULL DEFAULT 'system-serif',
    "fontBody" TEXT NOT NULL DEFAULT 'system-sans',
    "radiusScale" TEXT NOT NULL DEFAULT 'md',
    "logoMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "MenuStatus" NOT NULL DEFAULT 'DRAFT',
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_versions" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_publicId_key" ON "businesses"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE INDEX "businesses_status_idx" ON "businesses"("status");

-- CreateIndex
CREATE INDEX "businesses_createdAt_idx" ON "businesses"("createdAt");

-- CreateIndex
CREATE INDEX "business_memberships_businessId_idx" ON "business_memberships"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "business_memberships_userId_businessId_key" ON "business_memberships"("userId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "brand_themes_businessId_key" ON "brand_themes"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "menus_currentVersionId_key" ON "menus"("currentVersionId");

-- CreateIndex
CREATE INDEX "menus_businessId_status_idx" ON "menus"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "menus_businessId_key_key" ON "menus"("businessId", "key");

-- CreateIndex
CREATE INDEX "menu_versions_menuId_publishedAt_idx" ON "menu_versions"("menuId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "menu_versions_menuId_version_key" ON "menu_versions"("menuId", "version");

-- AddForeignKey
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_themes" ADD CONSTRAINT "brand_themes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "menu_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_versions" ADD CONSTRAINT "menu_versions_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_versions" ADD CONSTRAINT "menu_versions_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
