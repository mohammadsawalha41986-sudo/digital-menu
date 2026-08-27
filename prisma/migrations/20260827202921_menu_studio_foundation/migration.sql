-- AlterTable
ALTER TABLE "menu_categories" ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "costMinor" INTEGER;

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_options" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "priceDeltaMinor" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modifier_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_modifier_groups" (
    "itemId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_item_modifier_groups_pkey" PRIMARY KEY ("itemId","groupId")
);

-- CreateTable
CREATE TABLE "menu_designs" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "themeKey" TEXT NOT NULL DEFAULT 'modern-minimal',
    "layoutKey" TEXT NOT NULL DEFAULT 'a',
    "fontHeading" TEXT,
    "fontBody" TEXT,
    "fontPrice" TEXT,
    "fontAccent" TEXT,
    "imageStyle" TEXT,
    "density" TEXT,
    "showPrices" BOOLEAN NOT NULL DEFAULT true,
    "showImages" BOOLEAN NOT NULL DEFAULT true,
    "showCalories" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_presets" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "logoMediaId" TEXT,
    "extractedColors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "colorPrimary" TEXT NOT NULL,
    "colorSecondary" TEXT NOT NULL,
    "colorAccent" TEXT NOT NULL,
    "colorBackground" TEXT NOT NULL,
    "colorSurface" TEXT NOT NULL,
    "colorText" TEXT NOT NULL,
    "colorMuted" TEXT NOT NULL,
    "colorBorder" TEXT NOT NULL,
    "fontHeading" TEXT NOT NULL,
    "fontBody" TEXT NOT NULL,
    "fontPrice" TEXT NOT NULL,
    "fontAccent" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'light',
    "mood" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommendedThemeKey" TEXT,
    "manualOverrides" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fromLogo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modifier_groups_businessId_sortOrder_idx" ON "modifier_groups"("businessId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "modifier_groups_businessId_key_key" ON "modifier_groups"("businessId", "key");

-- CreateIndex
CREATE INDEX "modifier_options_groupId_sortOrder_idx" ON "modifier_options"("groupId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "modifier_options_groupId_key_key" ON "modifier_options"("groupId", "key");

-- CreateIndex
CREATE INDEX "menu_item_modifier_groups_businessId_idx" ON "menu_item_modifier_groups"("businessId");

-- CreateIndex
CREATE INDEX "menu_item_modifier_groups_itemId_sortOrder_idx" ON "menu_item_modifier_groups"("itemId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "menu_designs_menuId_key" ON "menu_designs"("menuId");

-- CreateIndex
CREATE INDEX "menu_designs_businessId_idx" ON "menu_designs"("businessId");

-- CreateIndex
CREATE INDEX "brand_presets_businessId_idx" ON "brand_presets"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "brand_presets_businessId_key_key" ON "brand_presets"("businessId", "key");

-- CreateIndex
CREATE INDEX "menu_categories_parentId_sortOrder_idx" ON "menu_categories"("parentId", "sortOrder");

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_designs" ADD CONSTRAINT "menu_designs_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_designs" ADD CONSTRAINT "menu_designs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_presets" ADD CONSTRAINT "brand_presets_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_presets" ADD CONSTRAINT "brand_presets_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
