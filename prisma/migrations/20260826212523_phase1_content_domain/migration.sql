-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('LOGO', 'ITEM_IMAGE', 'CATEGORY_IMAGE', 'OFFER_IMAGE', 'GALLERY', 'DOCUMENT', 'OG_IMAGE');

-- CreateEnum
CREATE TYPE "ItemAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'SEASONAL', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ServicePackage" AS ENUM ('BASIC', 'STANDARD', 'PREMIUM', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "addressAr" TEXT,
ADD COLUMN     "addressEn" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "facebook" TEXT,
ADD COLUMN     "googleMapsUrl" TEXT,
ADD COLUMN     "indexProfile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "linkedin" TEXT,
ADD COLUMN     "logoMediaId" TEXT,
ADD COLUMN     "metaDescriptionAr" TEXT,
ADD COLUMN     "metaDescriptionEn" TEXT,
ADD COLUMN     "metaTitleAr" TEXT,
ADD COLUMN     "metaTitleEn" TEXT,
ADD COLUMN     "ogMediaId" TEXT,
ADD COLUMN     "packageEndsAt" TIMESTAMP(3),
ADD COLUMN     "packageStartsAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "servicePackage" "ServicePackage" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "showPlatformFooter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tiktok" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "whatsapp" TEXT,
ADD COLUMN     "workingHours" JSONB,
ADD COLUMN     "youtube" TEXT;

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'ITEM_IMAGE',
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "altAr" TEXT,
    "altEn" TEXT,
    "originalName" TEXT,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "addressAr" TEXT,
    "addressEn" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "googleMapsUrl" TEXT,
    "workingHours" JSONB,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "imageMediaId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "priceMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "calories" INTEGER,
    "servingSizeAr" TEXT,
    "servingSizeEn" TEXT,
    "ingredientsAr" TEXT,
    "ingredientsEn" TEXT,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageMediaId" TEXT,
    "availability" "ItemAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_images" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_item_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_item_overrides" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "priceMinor" INTEGER,
    "availability" "ItemAvailability",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_item_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_storageKey_key" ON "media"("storageKey");

-- CreateIndex
CREATE INDEX "media_businessId_kind_idx" ON "media"("businessId", "kind");

-- CreateIndex
CREATE INDEX "branches_businessId_isActive_idx" ON "branches"("businessId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "branches_businessId_key_key" ON "branches"("businessId", "key");

-- CreateIndex
CREATE INDEX "menu_categories_businessId_idx" ON "menu_categories"("businessId");

-- CreateIndex
CREATE INDEX "menu_categories_menuId_sortOrder_idx" ON "menu_categories"("menuId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_menuId_key_key" ON "menu_categories"("menuId", "key");

-- CreateIndex
CREATE INDEX "menu_items_categoryId_sortOrder_idx" ON "menu_items"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "menu_items_businessId_availability_idx" ON "menu_items"("businessId", "availability");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_businessId_itemCode_key" ON "menu_items"("businessId", "itemCode");

-- CreateIndex
CREATE INDEX "menu_item_images_itemId_sortOrder_idx" ON "menu_item_images"("itemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_images_itemId_mediaId_key" ON "menu_item_images"("itemId", "mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_item_overrides_branchId_itemId_key" ON "branch_item_overrides"("branchId", "itemId");

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_ogMediaId_fkey" FOREIGN KEY ("ogMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_images" ADD CONSTRAINT "menu_item_images_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_images" ADD CONSTRAINT "menu_item_images_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_item_overrides" ADD CONSTRAINT "branch_item_overrides_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_item_overrides" ADD CONSTRAINT "branch_item_overrides_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
