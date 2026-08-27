-- CreateEnum
CREATE TYPE "OfferPlacement" AS ENUM ('HERO', 'FEATURED', 'BANNER', 'SECTION');

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "descriptionAr" TEXT,
    "descriptionEn" TEXT,
    "imageMediaId" TEXT,
    "originalPriceMinor" INTEGER,
    "offerPriceMinor" INTEGER,
    "discountPercent" INTEGER,
    "ctaLabelAr" TEXT,
    "ctaLabelEn" TEXT,
    "ctaUrl" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "placement" "OfferPlacement" NOT NULL DEFAULT 'FEATURED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "offers_businessId_isActive_startsAt_endsAt_idx" ON "offers"("businessId", "isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "offers_businessId_key_key" ON "offers"("businessId", "key");

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
